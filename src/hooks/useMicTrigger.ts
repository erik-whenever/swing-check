import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '../lib/logger';

const log = createLogger('useMicTrigger');

/** Permission lifecycle mirrored from the Permissions API where available. */
export type MicPermission = 'prompt' | 'granted' | 'denied';

export interface MicTrigger {
  /** Acquire the mic and begin the RMS loop. MUST be called from a user gesture (iOS). */
  start: () => Promise<void>;
  /** Stop the loop, release the mic and suspend the AudioContext. Safe to call repeatedly. */
  stop: () => void;
  /** Latest normalized RMS energy (0–1), updated once per animation frame while listening. */
  energy: number;
  isListening: boolean;
  permission: MicPermission;
}

// fftSize 1024 → 512 time-domain samples per frame; plenty of resolution for an
// RMS envelope at 60fps without spending cycles we don't need for amplitude alone.
const FFT_SIZE = 1024;

/**
 * Reusable mic-capture hook. Requests mic permission, wires
 * getUserMedia → MediaStreamSource → AnalyserNode, and exposes a real-time
 * normalized RMS energy stream via `energy`. No trigger/detection logic lives
 * here (that is A-2's `EnergyTrigger`) — this hook only owns capture + teardown.
 *
 * iOS PWA note: an AudioContext created outside a user gesture starts
 * 'suspended' and never produces samples. `start()` is therefore async, is meant
 * to be invoked from a tap, and resumes the context before the rAF loop begins.
 */
export function useMicTrigger(): MicTrigger {
  const [energy, setEnergy] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [permission, setPermission] = useState<MicPermission>('prompt');

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  // Reused across frames so the loop allocates nothing per tick.
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  /**
   * Resume the AudioContext from within a user gesture. Exposed internally and
   * called by `start()`; on iOS the context is otherwise stuck 'suspended'.
   */
  const resumeOnGesture = useCallback(async () => {
    const ctx = contextRef.current;
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        log.warn('AudioContext resume failed', { error: String(err) });
      }
    }
  }, []);

  // Self-scheduling rAF loop, ref-held so it can reschedule itself without a
  // stale dependency. It only reads refs and the stable setEnergy, so it's
  // assigned once in an effect rather than rebuilt each render.
  const loopRef = useRef<() => void>(() => {});
  useEffect(() => {
    loopRef.current = () => {
      const analyser = analyserRef.current;
      const buffer = bufferRef.current;
      if (!analyser || !buffer) return;

      analyser.getFloatTimeDomainData(buffer);
      // RMS of the time-domain samples ≈ perceived loudness envelope. Samples
      // are already ~[-1, 1], so RMS is effectively normalized to 0–1 here.
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        const s = buffer[i];
        sumSquares += s * s;
      }
      const rms = Math.sqrt(sumSquares / buffer.length);
      setEnergy(rms > 1 ? 1 : rms);

      rafRef.current = requestAnimationFrame(() => loopRef.current());
    };
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    // Stopping tracks is what actually releases the mic (and its OS indicator).
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // Suspend rather than close so a subsequent start() can reuse the context.
    if (contextRef.current && contextRef.current.state !== 'closed') {
      void contextRef.current.suspend().catch(() => {
        /* teardown must never throw */
      });
    }
    bufferRef.current = null;
    setEnergy(0);
    setIsListening(false);
  }, []);

  const start = useCallback(async () => {
    // Idempotent: a second start() while already listening is a no-op.
    if (streamRef.current) return;
    try {
      // Disable all three processing stages — echo cancellation, noise
      // suppression and AGC all distort raw amplitude, which is exactly the
      // signal the trigger (A-2) will threshold against.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      setPermission('granted');

      // Lazily create the context; reuse it across start/stop cycles.
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = contextRef.current ?? new AudioCtx();
      contextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      source.connect(analyser);
      // Intentionally NOT connected to ctx.destination — we only measure, never
      // play back (that would echo the mic through the speaker).
      sourceRef.current = source;
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize);

      await resumeOnGesture();

      setIsListening(true);
      rafRef.current = requestAnimationFrame(() => loopRef.current());
      log.info('Mic capture started', { sampleRate: ctx.sampleRate, fftSize: analyser.fftSize });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      // NotAllowedError/SecurityError = user or policy denied; anything else is
      // still a failure to capture, but only denial flips permission to 'denied'.
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPermission('denied');
      }
      log.error('Mic capture failed', { name, message: String(err) });
      // Roll back any partial acquisition so we don't leak a track/context.
      stop();
    }
  }, [resumeOnGesture, stop]);

  // Best-effort read of the current permission state so callers can render the
  // right prompt before the first gesture. Not all browsers expose 'microphone'.
  useEffect(() => {
    const perms = navigator.permissions;
    if (!perms?.query) return;
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (status) setPermission(status.state as MicPermission);
    };
    perms
      .query({ name: 'microphone' as PermissionName })
      .then((s) => {
        status = s;
        setPermission(s.state as MicPermission);
        s.addEventListener('change', onChange);
      })
      .catch(() => {
        /* microphone permission not queryable here — stay at 'prompt' */
      });
    return () => {
      status?.removeEventListener('change', onChange);
    };
  }, []);

  // Release everything on unmount so we never leak tracks or contexts.
  useEffect(() => {
    return () => {
      stop();
      if (contextRef.current && contextRef.current.state !== 'closed') {
        void contextRef.current.close().catch(() => {});
      }
      contextRef.current = null;
    };
  }, [stop]);

  return { start, stop, energy, isListening, permission };
}
