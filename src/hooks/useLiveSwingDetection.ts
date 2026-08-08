// React glue for the live capture path (ADR-003 §4, D-5 pass 2).
//
// Owns the four pieces and their lifetimes: a standalone PoseLandmarker, the bounded
// ring buffer, the rAF sampling loop, and the incremental detector. Everything the
// hook does that is interesting lives in those modules; this file is wiring, teardown
// and the render-rate throttle.
//
// RENDER-RATE THROTTLE. The loop produces a sample up to 15 times a second and the
// stats change on every one of them. Pushing that into React state would re-render the
// camera view at inference rate for a dev-only counter — competing for the main thread
// with the inference it is measuring. Stats are therefore published at PUBLISH_HZ;
// detected swings are published immediately, because those are the events being proved.
//
// This is a PARALLEL path. It never touches frameExtractor.ts, the recorded blob, the
// session store or the Vision call — the clip-based flow behaves exactly as before,
// whether this hook runs or not. Frame grab and analysis per live swing are pass 3.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger, serializeError } from '../lib/logger';
import { LivePoseLoop, type LiveLoopStats } from '../lib/livePoseLoop';
import { LiveSwingDetector, type LiveSwingReport } from '../lib/liveSwingDetector';
import { PoseRingBuffer, DEFAULT_RING_CAPACITY } from '../lib/poseRingBuffer';

const log = createLogger('LiveSwing');

/**
 * How often the chain runs over the window. Detection is O(window) with an envelope
 * read per candidate; at 15 fps sampling, running it per frame would spend more time
 * detecting than inferring. Twice a second is far inside the ~1 s settle the gate needs
 * anyway, so nothing is detected later for it.
 */
const DETECT_INTERVAL_SEC = 0.5;
/** Stats → React at this rate. Decoupled from the sampling rate on purpose. */
const PUBLISH_HZ = 2;

export type LiveStatus = 'idle' | 'starting' | 'running' | 'error';

export interface LiveDetectionState {
  status: LiveStatus;
  /** Every swing detected during this run, in order. */
  swings: LiveSwingReport[];
  stats: LiveLoopStats | null;
  /** Cost of the last detection pass over the window, milliseconds. */
  detectMs: number;
  error: string | null;
}

const INITIAL: LiveDetectionState = {
  status: 'idle',
  swings: [],
  stats: null,
  detectMs: 0,
  error: null,
};

/**
 * Run live pose + swing detection against a live <video> while `active`.
 *
 * @param videoRef the camera preview element (a live MediaStream, not a file).
 * @param active   true while recording; going false tears everything down.
 */
export function useLiveSwingDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  options?: { ringCapacity?: number },
): LiveDetectionState {
  const [state, setState] = useState<LiveDetectionState>(INITIAL);
  const ringCapacity = options?.ringCapacity ?? DEFAULT_RING_CAPACITY;

  // Kept in a ref so the sampling callback can read/write them without re-subscribing
  // on every render — the callback runs on the rAF thread and must stay allocation-free.
  const swingsRef = useRef<LiveSwingReport[]>([]);
  const lastDetectAtRef = useRef(0);
  const lastPublishAtRef = useRef(0);

  const reset = useCallback(() => {
    swingsRef.current = [];
    lastDetectAtRef.current = 0;
    lastPublishAtRef.current = 0;
  }, []);

  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let loop: LivePoseLoop | null = null;
    let landmarker: { close: () => void } | null = null;
    const buffer = new PoseRingBuffer(ringCapacity);
    const detector = new LiveSwingDetector();
    reset();

    (async () => {
      setState({ ...INITIAL, status: 'starting' });
      try {
        // Own instance, not the shared singleton: the clip path may start its own
        // extraction the moment recording stops, and the two must not reset each
        // other's tracking graph. See createPoseLandmarker's comment.
        const { createPoseLandmarker } = await import('../lib/poseDetector');
        const standalone = await createPoseLandmarker();
        if (cancelled) {
          standalone.close();
          return;
        }
        landmarker = standalone;

        loop = new LivePoseLoop({
          video,
          landmarker: standalone.landmarker,
          buffer,
          delegate: standalone.delegate,
          onSample: (sample, stats) => {
            // ── Detection, throttled ──────────────────────────────────────────
            if (sample.t - lastDetectAtRef.current >= DETECT_INTERVAL_SEC) {
              lastDetectAtRef.current = sample.t;
              const run = detector.run(buffer.toArray(), sample.t);
              if (run.reports.length > 0) {
                for (const r of run.reports) {
                  // The line requirement 3 asks for. WARN because the in-app log
                  // panel shows nothing below it.
                  log.warn(`Live swing ${r.index} detected`, {
                    envelopeSec: [round2(r.envelopeSec[0]), round2(r.envelopeSec[1])],
                    envelopeDurationSec: round2(r.envelopeSec[1] - r.envelopeSec[0]),
                    impactSec: r.impactSec === null ? null : round2(r.impactSec),
                    downswingSec: r.downswingSec === null ? null : round2(r.downswingSec),
                    verticalExcursion: round3(r.excursion),
                    peakSpeed: round3(r.peakSpeed),
                    latencySec: round2(r.latencySec),
                    detectMs: round1(run.detectMs),
                    windowSamples: run.windowSamples,
                    bufferSpanSec: stats.bufferSpanSec,
                    cadence: stats.cadence,
                    refSpeed: round3(run.refSpeed),
                  });
                }
                swingsRef.current = [...swingsRef.current, ...run.reports];
                // Publish immediately — a detected swing is the event being proved,
                // and the counter has to move while the golfer is still watching.
                setState((s) => ({
                  ...s,
                  status: 'running',
                  swings: swingsRef.current,
                  stats,
                  detectMs: run.detectMs,
                }));
                lastPublishAtRef.current = sample.t;
                return;
              }
              setState((s) => ({ ...s, detectMs: run.detectMs }));
            }

            // ── Stats, throttled ──────────────────────────────────────────────
            if (sample.t - lastPublishAtRef.current >= 1 / PUBLISH_HZ) {
              lastPublishAtRef.current = sample.t;
              setState((s) => ({ ...s, status: 'running', stats }));
            }
          },
        });
        loop.start();
        setState((s) => ({ ...s, status: 'running' }));
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        log.error('Live pose failed to start', { error: serializeError(err) });
        setState({ ...INITIAL, status: 'error', error: msg });
      }
    })();

    return () => {
      cancelled = true;
      loop?.stop();
      landmarker?.close();
      buffer.clear();
      detector.reset();
    };
  }, [active, videoRef, ringCapacity, reset]);

  return state;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}
