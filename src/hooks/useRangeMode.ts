import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Build a 1-second silent mono WAV as an object URL. Looping a real <audio>
 * element (rather than Web Audio) is what makes Safari iOS treat the page as
 * an active media player, so hardware/headset transport buttons reach us via
 * the Media Session API.
 */
function createSilentWavUrl(): string {
  const sampleRate = 8000;
  const numSamples = sampleRate; // 1 second
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate (8-bit mono)
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, numSamples, true);
  // 8-bit PCM silence is centered at 128.
  for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128);

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

/**
 * "Range mode": keeps a near-silent audio loop alive so headset transport
 * buttons (play/pause) fire `onHeadsetButton`. Must be toggled from a user
 * gesture so the initial audio.play() is allowed.
 */
export function useRangeMode(
  onHeadsetButton: () => void,
  /** Secondary transport action (commonly a headset double-press → "nexttrack"); ends a session. */
  onSecondaryAction?: () => void,
) {
  const [rangeMode, setRangeMode] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // Keep the latest handlers so the Media Session callbacks never go stale.
  const handlerRef = useRef(onHeadsetButton);
  useEffect(() => {
    handlerRef.current = onHeadsetButton;
  }, [onHeadsetButton]);
  const secondaryRef = useRef(onSecondaryAction);
  useEffect(() => {
    secondaryRef.current = onSecondaryAction;
  }, [onSecondaryAction]);

  const startLoop = useCallback(async () => {
    if (!audioRef.current) {
      const url = createSilentWavUrl();
      urlRef.current = url;
      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0.001;
      audioRef.current = audio;
    }
    try {
      await audioRef.current.play();
    } catch (err) {
      console.error('Silent audio loop failed to start:', err);
    }
    if ('mediaSession' in navigator) {
      const fire = () => handlerRef.current();
      navigator.mediaSession.setActionHandler('play', fire);
      navigator.mediaSession.setActionHandler('pause', fire);
      // Secondary transport (e.g. headset double-press) ends the session, when wired up.
      const fireSecondary = () => secondaryRef.current?.();
      try {
        navigator.mediaSession.setActionHandler('nexttrack', fireSecondary);
      } catch {
        /* not all browsers support every action */
      }
      navigator.mediaSession.playbackState = 'playing';
    }
  }, []);

  const stopLoop = useCallback(() => {
    audioRef.current?.pause();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      try {
        navigator.mediaSession.setActionHandler('nexttrack', null);
      } catch {
        /* ignore */
      }
      navigator.mediaSession.playbackState = 'none';
    }
  }, []);

  const toggleRangeMode = useCallback(() => {
    setRangeMode((prev) => {
      const next = !prev;
      if (next) startLoop();
      else stopLoop();
      return next;
    });
  }, [startLoop, stopLoop]);

  useEffect(() => {
    return () => {
      stopLoop();
      audioRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [stopLoop]);

  return { rangeMode, toggleRangeMode };
}
