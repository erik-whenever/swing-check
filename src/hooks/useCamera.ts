import { useRef, useState, useCallback, useEffect } from 'react';
import { createLogger } from '../lib/logger';
import { VideoChunkRing } from '../lib/videoChunkRing';
import { applyCameraZoom } from '../lib/cameraZoom';
import { useSettingsStore } from '../store/settings';

const log = createLogger('useCamera');

/**
 * How recorded video is retained.
 *
 *  'clip'    — accumulate every chunk and return one Blob on stop. Correct for a
 *              single swing, and the behaviour every existing flow depends on.
 *  'session' — feed a bounded `VideoChunkRing` instead and return NOTHING on stop.
 *              A range session has no end to slice from, and holding it all is the
 *              150–350 MB crash the ADR-003 inventory measured. Windows around each
 *              detected swing are cut from the ring while recording continues.
 */
export type RecordMode = 'clip' | 'session';

/** Chunk cadence. Also the resolution of the ring's chunk timestamps. */
const TIMESLICE_MS = 100;

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeRef = useRef<RecordMode>('clip');
  /** Bounded video history — non-null only while a 'session' recording runs. */
  const chunkRingRef = useRef<VideoChunkRing | null>(null);
  /**
   * `performance.now()` at recording start. THE shared clock origin: chunk
   * timestamps and live pose sample times are both measured from it, which is what
   * lets a swing detected at t=34.2 s address the right bytes in the ring.
   */
  const recordingEpochRef = useRef<number | null>(null);

  /** Last zoom flag actually pushed to the track; null = nothing applied yet. */
  const appliedWideAngleRef = useRef<boolean | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  /** Same value as `recordingEpochRef`, exposed as state for render-time consumers. */
  const [recordingEpochMs, setRecordingEpochMs] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wideAngle = useSettingsStore((s) => s.wideAngle);

  const startStream = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const settings = stream.getVideoTracks()[0]?.getSettings();
      log.info('Camera stream acquired', {
        width: settings?.width,
        height: settings?.height,
        frameRate: settings?.frameRate,
        facingMode: settings?.facingMode,
      });
      setIsStreaming(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not access camera';
      log.error('Camera access failed', { error: message });
      setError(message);
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // The next stream is a fresh track at default zoom, so what we applied to the
    // old one says nothing about it.
    appliedWideAngleRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  /**
   * Push the wide-angle setting onto the live track.
   *
   * Zoom is a property of the track, so this can only run once a stream exists —
   * and deliberately never while recording: `applyConstraints` reshapes the very
   * track the MediaRecorder is reading, and a lens change mid-swing would corrupt
   * the clip the analysis depends on. A toggle during a session is therefore not
   * dropped but deferred: the effect re-runs when recording stops, so the next
   * recording starts on the lens the user picked.
   */
  useEffect(() => {
    if (!isStreaming || isRecording) return;
    if (appliedWideAngleRef.current === wideAngle) return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    // Claim the intent before awaiting so a re-render cannot fire a second apply
    // for the same value. A rejected constraint is logged, not retried.
    appliedWideAngleRef.current = wideAngle;
    void applyCameraZoom(track, wideAngle);
  }, [isStreaming, isRecording, wideAngle]);

  const beginRecording = useCallback((mode: RecordMode) => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    modeRef.current = mode;

    const mimeType = MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    const epoch = performance.now();
    recordingEpochRef.current = epoch;
    setRecordingEpochMs(epoch);
    chunkRingRef.current = mode === 'session' ? new VideoChunkRing({ mimeType }) : null;

    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      const ring = chunkRingRef.current;
      // In session mode the ring is the ONLY place chunks live — deliberately not
      // both, since keeping the array too would restore the unbounded growth.
      if (ring) ring.push(e.data, (performance.now() - epoch) / 1000);
      else chunksRef.current.push(e.data);
    };

    recorder.onerror = (e) => {
      const err = (e as unknown as { error?: DOMException }).error;
      log.error('MediaRecorder error', {
        name: err?.name,
        message: err?.message ?? String(e),
      });
    };

    recorder.start(TIMESLICE_MS);
    mediaRecorderRef.current = recorder;
    log.info('Recording started', {
      mimeType,
      mode,
      timesliceMs: TIMESLICE_MS,
      startedAt: Date.now(),
    });
    setIsRecording(true);
  }, []);

  const startRecording = useCallback((countdownSeconds = 5, mode: RecordMode = 'clip') => {
    if (!streamRef.current) return;

    // No countdown requested → start capturing immediately.
    if (countdownSeconds <= 0) {
      beginRecording(mode);
      return;
    }

    let remaining = countdownSeconds;
    setCountdown(remaining);

    countdownTimerRef.current = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        setCountdown(remaining);
      } else {
        setCountdown(0); // "GO"
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        beginRecording(mode);
        // Clear the "GO" after a short flash
        setTimeout(() => setCountdown(null), 600);
      }
    }, 1000);
  }, [beginRecording]);

  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
  }, []);

  /**
   * Stop recording. Resolves with the finished clip in 'clip' mode, and with NULL
   * in 'session' mode — where there deliberately is no whole-session blob, only the
   * per-swing windows already cut from the ring.
   */
  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        return reject(new Error('No active recording'));
      }

      recorder.onstop = () => {
        const ring = chunkRingRef.current;
        if (ring) {
          log.info('Recording stopped', {
            stoppedAt: Date.now(),
            mode: 'session',
            mimeType: recorder.mimeType,
            chunksReceived: ring.receivedCount,
            receivedMb: round1(ring.receivedBytesCount / 1e6),
            // The bound, measured: what a session would have cost in RAM versus
            // what it actually held.
            retainedMb: round1(ring.bytes / 1e6),
            retainedSpanSec: round1(ring.spanSec),
            evictedChunks: ring.evictedCount,
          });
          setIsRecording(false);
          resolve(null);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        log.info('Recording stopped', {
          stoppedAt: Date.now(),
          mode: 'clip',
          blobSizeKb: Math.round(blob.size / 1024),
          mimeType: recorder.mimeType,
        });
        setIsRecording(false);
        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  /**
   * Release the session ring. Called once the last queued swing has taken its
   * window — earlier would strand an analysis that has not grabbed frames yet.
   */
  const releaseChunkRing = useCallback(() => {
    chunkRingRef.current?.clear();
    chunkRingRef.current = null;
    recordingEpochRef.current = null;
    setRecordingEpochMs(null);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  return {
    videoRef,
    /** The live capture stream, or null when not streaming. Read-only for callers:
     *  this hook owns its lifecycle — never stop or replace it from outside. */
    streamRef,
    isStreaming,
    isRecording,
    countdown,
    error,
    startStream,
    stopStream,
    startRecording,
    cancelCountdown,
    stopRecording,
    /** Bounded video history in session mode; null in clip mode. */
    chunkRingRef,
    /** Shared clock origin for chunk timestamps and live pose samples. */
    recordingEpochMs,
    releaseChunkRing,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
