import { useCallback, useEffect, useRef, useState } from 'react';
import { useMicTrigger, type MicTrigger } from './useMicTrigger';
import {
  EnergyTrigger,
  DEFAULT_ENERGY_TRIGGER_CONFIG,
  type EnergyTriggerConfig,
} from '../lib/audioTrigger';
import { speak } from '../lib/tts';
import { createLogger } from '../lib/logger';

const log = createLogger('useEnergyTrigger');

/** Spoken confirmation when a voice/clap trigger fires (sv, quick voice). */
export const TTS_RECORDING_STARTED = 'Startar inspelning';
/** How long the visual `pulse` flag stays true after a trigger (ms). */
const PULSE_MS = 600;

export interface EnergyTriggerHandle extends MicTrigger {
  /** Live trigger tuning (thresholdFactor / cooldownMs / absoluteFloor …). */
  config: EnergyTriggerConfig;
  /** Patch the trigger config; takes effect on the next audio frame. */
  setConfig: (patch: Partial<EnergyTriggerConfig>) => void;
  /** Momentary flag that flips true for {@link PULSE_MS} on each trigger (drives a UI pulse). */
  pulse: boolean;
}

/**
 * Energy-trigger hook (A-2). Wraps `useMicTrigger` (A-1) and runs each RMS
 * sample through an {@link EnergyTrigger}, calling `onTrigger` on a detected
 * spike. On trigger it also speaks a short Swedish confirmation and raises a
 * `pulse` flag for a visual cue. Capture and detection stay separated so the
 * wake-word layer (A-4) can replace detection without touching capture.
 *
 * `onTrigger` may change between renders without re-subscribing anything — it's
 * read through a ref, so the audio effect stays stable across the session.
 */
export function useEnergyTrigger(
  onTrigger: () => void,
  initialConfig: Partial<EnergyTriggerConfig> = {}
): EnergyTriggerHandle {
  const mic = useMicTrigger();

  // The detector and the latest onTrigger live in refs so the per-frame effect
  // below never needs them in its dependency list (which would rebuild it and
  // lose the detector's rolling baseline every render).
  const triggerRef = useRef<EnergyTrigger | null>(null);
  if (triggerRef.current === null) triggerRef.current = new EnergyTrigger(initialConfig);
  const onTriggerRef = useRef(onTrigger);
  useEffect(() => {
    onTriggerRef.current = onTrigger;
  }, [onTrigger]);

  const [config, setConfigState] = useState<EnergyTriggerConfig>(() => ({
    ...DEFAULT_ENERGY_TRIGGER_CONFIG,
    ...initialConfig,
  }));
  const [pulse, setPulse] = useState(false);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setConfig = useCallback((patch: Partial<EnergyTriggerConfig>) => {
    triggerRef.current!.setConfig(patch);
    setConfigState(triggerRef.current!.configSnapshot);
  }, []);

  // Restart calibration whenever capture (re)starts, so each session relearns
  // the room instead of carrying a stale baseline/cooldown across stops.
  useEffect(() => {
    if (mic.isListening) triggerRef.current!.reset();
  }, [mic.isListening]);

  // One evaluation per energy update. `energy` is React state that useMicTrigger
  // refreshes ~once per animation frame, so this effectively runs in lockstep
  // with the RMS loop without this hook owning a second rAF loop.
  useEffect(() => {
    if (!mic.isListening) return;
    if (!triggerRef.current!.push(mic.energy)) return;

    log.info('Voice trigger fired', { energy: mic.energy, baseline: triggerRef.current!.baselineEnergy });
    onTriggerRef.current();
    // Quick spoken ack + visual pulse so the golfer knows recording began.
    speak(TTS_RECORDING_STARTED);
    setPulse(true);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => setPulse(false), PULSE_MS);
  }, [mic.energy, mic.isListening]);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  return { ...mic, config, setConfig, pulse };
}

export { DEFAULT_ENERGY_TRIGGER_CONFIG };
