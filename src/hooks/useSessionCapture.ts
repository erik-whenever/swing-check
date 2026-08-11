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
//
// NOT EVERY DETECTION IS A SWING. The queue's first act is an impact gate: without a
// confident impact on the envelope the swing is marked `skipped` and nothing is spent
// on it (see the gate in `runSwing`). It sits inside the queued work rather than in
// `onSwing` on purpose — settings are read at run time, and the swing still gets its
// window cut and its row in the session list, so a gated detection is visible instead
// of silently absent.

import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeSwing } from '../lib/api';
import { ANGLE_TO_PROMPT, ruleMatchesAngle } from '../lib/cameraAngle';
import { ANALYSIS_FRAME_COUNT, type FrameMeta } from '../lib/frameExtractor';
import { createLogger, serializeError } from '../lib/logger';
import { grabFramesAtTimes } from '../lib/poseFrameGrab';
import { MAX_OUTPUT_SIDE } from '../lib/poseCropBox';
import { selectEnvelopeFrames } from '../lib/poseEnvelopeSelection';
import { SerialQueue, type QueueStats } from '../lib/analysisQueue';
import { sessionStats } from '../lib/sessionStats';
import { buildSpeechParts, enqueueSpeech, TTS_FAILED } from '../lib/tts';
import type { LiveLoopStats } from '../lib/livePoseLoop';
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
      const { ttsEnabled, ttsMode, cameraAngle, requireImpact } =
        useSettingsStore.getState();

      // ── Impact gate ───────────────────────────────────────────────────────
      // Before the frame grab and before Vision, because everything expensive is
      // downstream of here. A detection without a confident impact is, on every
      // production log so far, not a swing — someone walking past the camera. It is
      // not merely a wasted call either: the stretched envelope makes the pose crop
      // box cover nearly the whole frame (93.9 % measured), so the false detection
      // costs MORE than a real swing ($0.0408), takes its place in the serial queue
      // ahead of real swings, and gets read aloud in the headphones.
      //
      // Skipped, not failed: nothing went wrong. The WARN below carries the envelope
      // figures because the open question is the opposite one — whether this gate
      // rejects real swings on the range. `requireImpact` is the off switch for that.
      if (requireImpact && report.envelope.impact === null) {
        updateSwing(swingId, {
          status: 'skipped',
          error: 'Ingen bekräftad träff — analysen hoppades över',
          timings: { ...timings },
        });
        sessionStats.recordSkippedNoImpact();
        const [envStart, envEnd] = report.envelopeSec;
        log.warn('Session swing skipped — no confident impact', {
          swingIndex,
          envelopeSec: [round2(envStart), round2(envEnd)],
          envelopeDurationSec: round2(envEnd - envStart),
          verticalExcursion: round3(report.excursion),
          peakSpeed: round2(report.peakSpeed),
          // Why the envelope logic itself declined to call an impact — without it the
          // four numbers above say a swing was rejected but not on what grounds.
          impactReason: report.envelope.impactReason,
          clippedTail: report.envelope.clippedTail,
        });
        return;
      }

      const focusRuleId = useSessionStore.getState().focusRuleId;
      const sessionId = useSessionStore.getState().sessionId;
      const activeRules = useRulesStore
        .getState()
        .rules.filter((r) => r.active && ruleMatchesAngle(r, cameraAngle));

      if (activeRules.length === 0) {
        const reason = 'Inga aktiva regler för vinkeln';
        updateSwing(swingId, { status: 'failed', error: reason });
        sessionStats.recordFailure(reason);
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
        // Pose-driven crop (Ström E): one box for the whole swing, derived at detection
        // time from the landmarks this envelope was accepted on. Images are ~95 % of the
        // analysis cost, and most of an uncropped frame is range background.
        const { frames, crop } = await grabFramesAtTimes(window.blob, times, FRAME_QUALITY, {
          windowStartSec: window.startSec,
          windowEndSec: window.endSec,
          cropBounds: report.cropBounds,
          maxOutputSide: MAX_OUTPUT_SIDE,
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
          onUsage: (usage) => sessionStats.recordUsage(usage),
        });
        const visionMs = Math.round(performance.now() - visionStart);
        timings.analysisMs = sinceAnchorMs();
        updateSwing(swingId, { analysis, status: 'done', timings: { ...timings } });
        sessionStats.recordAnalyzed({ framesMs: timings.framesMs, visionMs });

        // ── Speech (own queue — never blocks the next analysis) ───────────────
        if (ttsEnabled) {
          const parts = buildSpeechParts(analysis, ttsMode, focusRuleId, {
            swingNumber: swingIndex,
          });
          enqueueSpeech(parts, {
            onEnd: () => {
              timings.spokenMs = sinceAnchorMs();
              updateSwing(swingId, { timings: { ...timings } });
              sessionStats.recordSpoken(timings.spokenMs);
              log.warn(`Session swing ${swingIndex} spoken`, {
                anchorSec: round2(anchorSec),
                spokenMs: timings.spokenMs,
              });
            },
          });
        }

        // ── History (frames only — the window blob is NOT persisted) ──────────
        // The materialized window carries every lead-in chunk back to the last
        // keyframe so the fragment decodes standalone, which makes its size a
        // function of the ring, not of the swing: ~28 MB in production and up to
        // ~55 MB at full 30 s retention. Times MAX_RECORDS that is half a gigabyte
        // in IndexedDB for bytes nothing reads — SwingCard renders `record.frames`,
        // and ShareButton/FramePreview take `currentVideoBlob` from the session
        // store, never the history record (supabase.ts likewise hydrates an empty
        // blob). The clip path still saves its real recording.
        await saveRecordRef.current({
          id: uuid(),
          timestamp: Date.now(),
          videoBlob: new Blob([]),
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
          // Crop effect, per swing — the numbers a field test verifies the saving on.
          cropReason: crop.reason,
          cropBox: crop.rect
            ? [crop.rect.x, crop.rect.y, crop.rect.width, crop.rect.height]
            : null,
          // Area as a share of the frame, on every swing — cropped or not. Area is no
          // longer a gate in either direction, so this is purely observational: it is how
          // we learn what values real swings land on instead of guessing at thresholds.
          // `cropAspect` sits next to it because the box is now free to be tall and
          // narrow, and its shape is the other half of that answer.
          cropAreaPct: Math.round(crop.areaFrac * 1000) / 10,
          cropAspect: crop.aspect,
          gateDetail: crop.gateDetail,
          outputSize: [crop.output.width, crop.output.height],
          tokensPerFrame: crop.outputTokens,
          savedTokens: (crop.baselineTokens - crop.outputTokens) * frames.length,
          savedPct: crop.savedPct,
          windowSec: [round2(window.startSec), round2(window.endSec)],
          windowMb: round2(window.bytes / 1e6),
          windowChunks: window.chunks,
          // Deliberate: the window is used for frame grabbing and then dropped.
          savedVideoBytes: 0,
          queueDepth: queue.stats.depth,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateSwing(swingId, { status: 'failed', error: msg, timings: { ...timings } });
        sessionStats.recordFailure(msg);
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
      sessionStats.recordDetected(Math.round(report.latencySec * 1000));
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
        const reason = 'Ingen videobuffert för sessionen';
        updateSwing(swingId, { status: 'failed', error: reason });
        sessionStats.recordFailure(reason);
        log.error('Session swing has no chunk ring', { swingIndex, hasRing: !!ring });
        return;
      }

      // Cut NOW — see the header: retention must not depend on queue depth.
      const [envStart, envEnd] = report.envelopeSec;
      const winStart = Math.max(0, envStart - WINDOW_PRE_SEC);
      const winEnd = Math.min(envEnd + WINDOW_POST_SEC, winStart + MAX_WINDOW_SEC);
      const window = ring.materialize(winStart, winEnd);

      if (!window) {
        const reason = 'Videofönstret fanns inte kvar i bufferten';
        updateSwing(swingId, { status: 'failed', error: reason });
        sessionStats.recordFailure(reason);
        log.error('Window materialization failed', {
          swingIndex,
          requestedSec: [round2(winStart), round2(winEnd)],
          ringSpanSec: [round2(ring.oldestSec), round2(ring.newestSec)],
          ringChunks: ring.size,
        });
        return;
      }

      sessionStats.recordWindow({
        windowMb: window.bytes / 1e6,
        ringEvicted: ring.evictedCount,
      });

      log.warn(`Session swing ${swingIndex} captured`, {
        anchorSec: round2(report.anchorSec),
        detectLatencySec: round2(report.latencySec),
        windowSec: [round2(window.startSec), round2(window.endSec)],
        windowMb: round2(window.bytes / 1e6),
        chunks: window.chunks,
        leadInChunks: window.leadInChunks,
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

  // `onPoseStats` is stable and the collector ignores everything outside a session,
  // so the dev-preview-outside-a-session case (detect and log only) contributes
  // nothing to a session's numbers.
  const onPoseStats = useCallback((stats: LiveLoopStats) => {
    sessionStats.recordPoseStats({
      samples: stats.samples,
      posesDetected: stats.posesDetected,
      achievedFps: stats.achievedFps,
    });
  }, []);

  const live = useLiveSwingDetection(videoRef, active, {
    epochMs: recordingEpochMs ?? undefined,
    onSwing,
    onStats: onPoseStats,
  });

  /** Resolves once every queued swing has finished. Used before releasing the ring. */
  const drain = useCallback(() => queue.enqueue(async () => {}), [queue]);

  return { live, queue: queueStats, drain };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
