// Energy-based voice/clap trigger (Ström A, A-2).
//
// Consumes the normalized RMS `energy` stream from `useMicTrigger` (A-1) and
// decides when a short amplitude spike — the word "start" or a clap — should
// fire `onTrigger`. This is the MVP detector before the on-device wake-word
// (Porcupine, A-4); it deliberately trades precision for zero dependencies and
// full offline operation in an iOS standalone PWA.
//
// Why adaptive, not a fixed threshold: a driving range is acoustically noisy —
// ball strikes resemble claps, wind adds broadband hiss, and absolute levels
// drift with mic gain and distance. A fixed cutoff would either miss "start" in
// a loud bay or fire constantly in a quiet one. So we track a rolling baseline
// (EMA of recent energy) and trigger only on a spike that is BOTH a large
// multiple of that baseline AND above an absolute floor. False positives are
// expected; the goal is "good enough to field-test" (measured/trimmed in A-5).

/** Tunable parameters for {@link EnergyTrigger}. Exposed for A-5 field tuning. */
export interface EnergyTriggerConfig {
  /** Fire when instantaneous energy exceeds `baseline × thresholdFactor`. */
  thresholdFactor: number;
  /** Debounce after a trigger: ignore further spikes for this long (ms). */
  cooldownMs: number;
  /** Hard gate: a spike below this raw energy never triggers (kills quiet-room jitter). */
  absoluteFloor: number;
  /** Time constant of the rolling baseline EMA (ms). ~1.5 s of context. */
  baselineTauMs: number;
  /** Startup window during which we learn the baseline but never trigger (ms). */
  calibrationMs: number;
}

export const DEFAULT_ENERGY_TRIGGER_CONFIG: EnergyTriggerConfig = {
  thresholdFactor: 3.5,
  cooldownMs: 2500,
  absoluteFloor: 0.02,
  baselineTauMs: 1500,
  calibrationMs: 1000,
};

/**
 * Stateful, framework-agnostic energy trigger. Feed it one energy sample per
 * frame via {@link push}; it returns `true` on exactly the frame a trigger
 * fires. No React, no audio APIs — pure logic so it can be unit-tested and so
 * the capture layer (A-1) and detection layer stay decoupled.
 */
export class EnergyTrigger {
  private config: EnergyTriggerConfig;
  private baseline = 0;
  private startedAt: number | null = null;
  private lastTriggerAt = Number.NEGATIVE_INFINITY;
  private lastSampleAt: number | null = null;

  constructor(config: Partial<EnergyTriggerConfig> = {}) {
    this.config = { ...DEFAULT_ENERGY_TRIGGER_CONFIG, ...config };
  }

  /** Current config (copy — mutate via {@link setConfig}). */
  get configSnapshot(): EnergyTriggerConfig {
    return { ...this.config };
  }

  /** Live-patch config (A-5 tuning / settings). Takes effect on the next sample. */
  setConfig(patch: Partial<EnergyTriggerConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /** Forget baseline/cooldown/calibration so the next `push` restarts cleanly. */
  reset(): void {
    this.baseline = 0;
    this.startedAt = null;
    this.lastTriggerAt = Number.NEGATIVE_INFINITY;
    this.lastSampleAt = null;
  }

  /** The baseline the detector is currently comparing against (for debug/UI). */
  get baselineEnergy(): number {
    return this.baseline;
  }

  /**
   * Feed one energy sample. Returns `true` iff a trigger fires on this frame.
   * @param energy normalized RMS in [0, 1] from `useMicTrigger`.
   * @param now monotonic timestamp (ms); defaults to `performance.now()`.
   */
  push(energy: number, now: number = performance.now()): boolean {
    // First sample: seed the baseline and start the calibration clock.
    if (this.startedAt === null) {
      this.startedAt = now;
      this.lastSampleAt = now;
      this.baseline = energy;
      return false;
    }

    // Frame-rate-independent EMA: derive the smoothing factor from real elapsed
    // time so the ~1.5 s memory holds whether we run at 30 or 120 fps.
    const dt = Math.max(0, now - (this.lastSampleAt ?? now));
    this.lastSampleAt = now;
    const alpha = 1 - Math.exp(-dt / this.config.baselineTauMs);

    const isSpike =
      energy > this.baseline * this.config.thresholdFactor &&
      energy > this.config.absoluteFloor;

    // Freeze the baseline while a spike is in progress; otherwise a loud "start"
    // drags the baseline up and desensitizes the very comparison we rely on.
    if (!isSpike) {
      this.baseline += alpha * (energy - this.baseline);
    }

    // Never trigger while still learning the room.
    if (now - this.startedAt < this.config.calibrationMs) return false;
    // Debounce: one physical event (word + its echo) must yield one trigger.
    if (now - this.lastTriggerAt < this.config.cooldownMs) return false;

    if (isSpike) {
      this.lastTriggerAt = now;
      return true;
    }
    return false;
  }
}
