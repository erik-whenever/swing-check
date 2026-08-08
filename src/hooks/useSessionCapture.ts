// PER-SWING CAPTURE AND ANALYSIS during a running session (ADR-003 §5, D-5 pass 3).
//
// This is the file that makes session mode real. Pass 2 proved a swing can be
// DETECTED while recording; everything after the detection — cutting the video,
// grabbing frames, calling Vision, speaking the verdict — still required stopping
// and going through the clip path. Here that chain runs per swing, while the camera
// keeps rolling and the detector keeps working on swing N+1.
//
// THE SHAPE, and why it is this shape:
//
//   detector (rAF thread)  ──►  cut window from the chunk ring  ──►  enqueue
//                                        (synchronous, cheap)          │
//                                                                      ▼
//                                          serial queue: frames → Vision → store
//                                                                      │
//                                                                      ▼
//                                                         speech queue (own FIFO)
//
// Three properties fall out of that split, and all three are requirements:
//
//  1. DETECTION NEVER WAITS. The only work on the detector's thread is a Blob cut,
//     which is a reference splice, not a copy. Swing N+1 is detected on schedule no
//     matter how far behind the analysis of swing N is.
//  2. THE WINDOW IS CUT IMMEDIATELY, not when the queue reaches the swing. The ring
//     only retains ~30 s; if two analyses are backed up behind a slow range
//     connection, swing N+2's bytes would be long evicted by the time its turn came.
//     Cutting at detection time makes retention independent of queue depth — the
//     materialized window holds its own chunks alive.
//  3. SPEECH IS SERIALIZED SEPARATELY. The analysis queue must not block on someone
//     listening to a verdict, and two verdicts must never talk over each other. Two
//     queues, one constraint each (see `enqueueSpeech` in tts.ts).
//
// A FAILING SWING IS A FAILING SWING, not a failing session: every stage records
// `failed` on that swing and returns. Detection and the queue carry on.

import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeSwing } from '../lib/api';
import { ANGLE_TO_PROMPT, ruleMatchesAngle } from '../lib/cameraAngle';
import { ANALYSIS_FRAME_COUNT, type FrameMeta } from '../lib/frameExtractor';
import { createLogger, serializeError } from '../lib/logger';
import { grabFramesAtTimes } from '../lib/poseFrameGrab';
import { selectEnvelopeFrames } from '../lib/poseEnvelopeSelection';
import { SerialQueue, type QueueStats } from '../lib/analysisQueue';
import { buildSpeechParts, enqueueSpeech, TTS_FAILED } from '../lib/tts';
import type { LiveSwingReport } from '../lib/liveSwingDetector';
import type { MaterializedWindow, VideoChunkRing } from '../lib/videoChunkRing';
import { useRulesStore } from '../store/rules';
import { useSettingsStore } from '../store/settings';
import { useSessionStore, type SwingTimings } from '../store/session';
import { useLiveSwingDetection, type LiveDetectionState } from './useLiveSwingDetection';
import { useHistory } from './useHistory';
import { v4 as uuid } from 'uuid';

const log = createLogger('SessionCapture');

// ── Tunables ─────────────────────────────────────────────────────────────────
/**
 * Padding around the envelope when cutting the video window. Generous on purpose:
 * the cost of a second of extra video is a few hundred kB held for a few seconds,
 * and the cost of cutting a frame short is a swing whose address or finish is
 * missing from the analysis.
 */
const WINDOW_PRE_SEC = 1.0;
const WINDOW_POST_SEC = 1.0;
/**
 * Hard cap on a materialized window (ADR-003 §4.3 says ~10 s). An envelope is
 * 0.7–3.0 s by the gate's own limits, so the padded window lands at 2.7–5 s and
 * this only ever bites if the envelope logic returns something unreasonable.
 */
const MAX_WINDOW_SEC = 10;
/** JPEG quality for analysis frames — same as the clip path. */
const FRAME_QUALITY = 0.8;

const EMPTY_QUEUE_STATS: QueueStats = {
  depth: 0,
  busy: false,
  maxDepth: 0,
  started: 0,
  completed: 0,
  failed: 0,
  cleared: 0,
};

export interface SessionCaptureState {
  /** Live detection state — the dev panel renders this. */
  live: LiveDetectionState;
  /** Analysis queue depth and throughput. */
  queue: QueueStats;
}

export interface SessionCaptureOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Run live pose + detection. */
  active: boolean;
  /**
   * Capture and analyze detected swings. False = detect and log only, which is what
   * the dev panel does outside a session (there is no chunk ring in clip mode, so
   * there is nothing to cut a window from).
   */
  captureEnabled: boolean;
  chunkRingRef: React.RefObject<VideoChunkRing | null>;
  /**
   * `performance.now()` at recording start — state, not a ref, because the live
   * loop needs it during render to align its clock with the chunk ring's.
   */
  recordingEpochMs: number | null;
}

export function useSessionCapture({
  videoRef,
  active,
  captureEnabled,
  chunkRingRef,
  recordingEpochMs,
}: SessionCaptureOptions): SessionCaptureState & { drain: () => Promise<void> } {
  const [queueStats, setQueueStats] = useState<QueueStats>(EMPTY_QUEUE_STATS);
  // Lazy state initializer, not useMemo: the queue holds in-flight work and must
  // survive every render of the session, which useMemo does not promise.
  const [queue] = useState(() => new SerialQueue({ onChange: setQueueStats }));

  const addSwing = useSessionStore((s) => s.addSwing);
  const updateSwing = useSessionStore((s) => s.updateSwing);
  const beginSwing = useSessionStore((s) => s.beginSwing);
  const { saveRecord } = useHistory();

  // Held in refs so the detector callback stays stable — rebuilding it would
  // rebuild the landmarker underneath it.
  const saveRecordRef = useRef(saveRecord);
  const captureEnabledRef = useRef(captureEnabled);
  const epochRef = useRef(recordingEpochMs);
  useEffect(() => {
    saveRecordRef.current = saveRecord;
    captureEnabledRef.current = captureEnabled;
    epochRef.current = recordingEpochMs;
  });

  // The recording clock, in seconds — the same clock the detector reports swing
  // times in, and the one the chunk ring stamps chunks with.
  const nowSec = useCallback(
    (epochMs: number) => (performance.now() - epochMs) / 1000,
    [],
  );

  /**
   * Everything after the window is cut. Runs on the serial queue, one swing at a
   * time, off the detection path.
   */
  const runSwing = useCallback(
    async (
      swingId: string,
      report: LiveSwingReport,
      window: MaterializedWindow,
      epochMs: number,
      swingIndex: number,
    ) => {
      const anchorSec = report.anchorSec;
      const sinceAnchorMs = () => Math.round((nowSec(epochMs) - anchorSec) * 1000);
      const timings: SwingTimings = {
        anchorSec: round2(anchorSec),
        detectedMs: Math.round(report.latencySec * 1000),
        framesMs: null,
        analysisMs: null,
        spokenMs: null,
      };

      // Read settings and rules at RUN time, not at detection time: a session can
      // outlive a settings change, and the swing should be analyzed against what is
      // true when it is analyzed.
      const { ttsEnabled, ttsMode, cameraAngle } = useSettingsStore.getState();
      const focusRuleId = useSessionStore.getState().focusRuleId;
      const sessionId = useSessionStore.getState().sessionId;
      const activeRules = useRulesStore
        .getState()
        .rules.filter((r) => r.active && ruleMatchesAngle(r, cameraAngle));

      if (activeRules.length === 0) {
        updateSwing(swingId, { status: 'failed', error: 'Inga aktiva regler för vinkeln' });
        log.warn('Session swing skipped — no active rules', { swingIndex, cameraAngle });
        return;
      }

      try {
        // ── Frames ────────────────────────────────────────────────────────────
        updateSwing(swingId, { status: 'extracting' });
        // The SAME allocation the clip path runs, on the same envelope object the
        // gate accepted — not a re-derivation from the reported boundaries.
        const selection = selectEnvelopeFrames(
          report.envelope,
          ANALYSIS_FRAME_COUNT,
          report.envelope.startSec,
          report.envelope.finishSec,
        );
        const times = selection.picks.map((p) => p.t);
        const grabStart = performance.now();
        const frames = await grabFramesAtTimes(window.blob, times, FRAME_QUALITY, {
          windowStartSec: window.startSec,
          windowEndSec: window.endSec,
        });
        const grabMs = Math.round(performance.now() - grabStart);
        const frameMeta: FrameMeta[] = selection.picks.map((p, i) => ({
          b64: frames[i],
          score: 0,
          isAddress: p.phase === 'address',
          isSwingStart: i === 0,
          candidateIndex: i,
          phase: p.phase,
          timeSec: p.t,
        }));
        timings.framesMs = sinceAnchorMs();
        updateSwing(swingId, {
          frames,
          frameMeta,
          status: 'analyzing',
          timings: { ...timings },
        });

        // ── Vision ────────────────────────────────────────────────────────────
        const visionStart = performance.now();
        const analysis = await analyzeSwing(frames, activeRules, {
          focusRuleId: focusRuleId ?? undefined,
          cameraAngle: ANGLE_TO_PROMPT[cameraAngle],
          quickMode: ttsEnabled && ttsMode === 'quick',
        });
        const visionMs = Math.round(performance.now() - visionStart);
        timings.analysisMs = sinceAnchorMs();
        updateSwing(swingId, { analysis, status: 'done', timings: { ...timings } });

        // ── Speech (own queue — never blocks the next analysis) ───────────────
        if (ttsEnabled) {
          const parts = buildSpeechParts(analysis, ttsMode, focusRuleId, {
            swingNumber: swingIndex,
          });
          enqueueSpeech(parts, {
            onEnd: () => {
              timings.spokenMs = sinceAnchorMs();
              updateSwing(swingId, { timings: { ...timings } });
              log.warn(`Session swing ${swingIndex} spoken`, {
                anchorSec: round2(anchorSec),
                spokenMs: timings.spokenMs,
              });
            },
          });
        }

        // ── History (the window, not the session — the session has no blob) ───
        await saveRecordRef.current({
          id: uuid(),
          timestamp: Date.now(),
          videoBlob: window.blob,
          frames,
          results: [
            ...(analysis.focus_rule ? [analysis.focus_rule] : []),
            ...analysis.rules,
          ],
          focusRuleId: focusRuleId ?? undefined,
          overallAssessment: analysis.overall_assessment,
          cameraAngle,
          sessionId: sessionId ?? undefined,
        });

        // The latency chain requirement 6 asks for, one line per swing. WARN
        // because the in-app log panel shows nothing below it.
        log.warn(`Session swing ${swingIndex} analyzed`, {
          anchorSec: round2(anchorSec),
          impactSec: report.impactSec === null ? null : round2(report.impactSec),
          // Anchor-relative chain — the numbers that decide whether the mode works.
          detectedMs: timings.detectedMs,
          framesMs: timings.framesMs,
          analysisMs: timings.analysisMs,
          // Stage costs, for attributing the chain above.
          grabMs,
          visionMs,
          frameCount: frames.length,
          impactCluster: selection.impactClusterApplied,
          usedEnvelope: selection.usedEnvelope,
          windowSec: [round2(window.startSec), round2(window.endSec)],
          windowMb: round2(window.bytes / 1e6),
          windowChunks: window.chunks,
          queueDepth: queue.stats.depth,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateSwing(swingId, { status: 'failed', error: msg, timings: { ...timings } });
        log.error(`Session swing ${swingIndex} failed`, {
          error: serializeError(err),
          anchorSec: round2(anchorSec),
          stage: timings.framesMs === null ? 'frames' : 'vision',
          // Explicitly: the session keeps going. This is one swing, not the run.
          queueDepth: queue.stats.depth,
        });
        if (useSettingsStore.getState().ttsEnabled) {
          enqueueSpeech([`Sving ${swingIndex}: ${TTS_FAILED}`]);
        }
      }
    },
    [nowSec, queue, updateSwing],
  );

  /** Detector callback — synchronous, cheap, and on the rAF thread. */
  const onSwing = useCallback(
    (report: LiveSwingReport) => {
      if (!captureEnabledRef.current) return;
      const epochMs = epochRef.current;
      const ring = chunkRingRef.current;

      beginSwing();
      const swingIndex = useSessionStore.getState().swings.length + 1;
      const swingId = addSwing({
        status: 'detected',
        envelopeSec: report.envelopeSec,
        impactSec: report.impactSec,
        timings: {
          anchorSec: round2(report.anchorSec),
          detectedMs: Math.round(report.latencySec * 1000),
          framesMs: null,
          analysisMs: null,
          spokenMs: null,
        },
      });

      if (!ring || epochMs === null) {
        updateSwing(swingId, { status: 'failed', error: 'Ingen videobuffert för sessionen' });
        log.error('Session swing has no chunk ring', { swingIndex, hasRing: !!ring });
        return;
      }

      // Cut NOW — see the header: retention must not depend on queue depth.
      const [envStart, envEnd] = report.envelopeSec;
      const winStart = Math.max(0, envStart - WINDOW_PRE_SEC);
      const winEnd = Math.min(envEnd + WINDOW_POST_SEC, winStart + MAX_WINDOW_SEC);
      const window = ring.materialize(winStart, winEnd);

      if (!window) {
        updateSwing(swingId, {
          status: 'failed',
          error: 'Videofönstret fanns inte kvar i bufferten',
        });
        log.error('Window materialization failed', {
          swingIndex,
          requestedSec: [round2(winStart), round2(winEnd)],
          ringSpanSec: [round2(ring.oldestSec), round2(ring.newestSec)],
          ringChunks: ring.size,
        });
        return;
      }

      log.warn(`Session swing ${swingIndex} captured`, {
        anchorSec: round2(report.anchorSec),
        detectLatencySec: round2(report.latencySec),
        windowSec: [round2(window.startSec), round2(window.endSec)],
        windowMb: round2(window.bytes / 1e6),
        chunks: window.chunks,
        headerPrepended: window.headerPrepended,
        truncatedStart: window.truncatedStart,
        truncatedEnd: window.truncatedEnd,
        ringRetainedMb: round2(ring.bytes / 1e6),
        ringEvicted: ring.evictedCount,
        queueDepth: queue.stats.depth,
      });

      // Rejections are already recorded on the swing; swallow here so an unhandled
      // rejection cannot surface as a session-level error.
      void queue
        .enqueue(() => runSwing(swingId, report, window, epochMs, swingIndex))
        .catch(() => {});
    },
    [addSwing, updateSwing, beginSwing, chunkRingRef, queue, runSwing],
  );

  const live = useLiveSwingDetection(videoRef, active, {
    epochMs: recordingEpochMs ?? undefined,
    onSwing,
  });

  /** Resolves once every queued swing has finished. Used before releasing the ring. */
  const drain = useCallback(() => queue.enqueue(async () => {}), [queue]);

  return { live, queue: queueStats, drain };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
