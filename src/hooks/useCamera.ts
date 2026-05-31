import { useRef, useState, useCallback, useEffect } from 'react';
import { createLogger } from '../lib/logger';

const log = createLogger('useCamera');

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  const beginRecording = useCallback(() => {
    if (!streamRef.current) return;

    chunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

    const recorder = new MediaRecorder(streamRef.current, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onerror = (e) => {
      const err = (e as unknown as { error?: DOMException }).error;
      log.error('MediaRecorder error', {
        name: err?.name,
        message: err?.message ?? String(e),
      });
    };

    recorder.start(100);
    mediaRecorderRef.current = recorder;
    log.info('Recording started', { mimeType, startedAt: Date.now() });
    setIsRecording(true);
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    let remaining = 5;
    setCountdown(remaining);

    countdownTimerRef.current = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        setCountdown(remaining);
      } else {
        setCountdown(0); // "GO"
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        beginRecording();
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

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        return reject(new Error('No active recording'));
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        log.info('Recording stopped', {
          stoppedAt: Date.now(),
          blobSizeKb: Math.round(blob.size / 1024),
          mimeType: recorder.mimeType,
        });
        setIsRecording(false);
        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  return {
    videoRef,
    isStreaming,
    isRecording,
    countdown,
    error,
    startStream,
    stopStream,
    startRecording,
    cancelCountdown,
    stopRecording,
  };
}
