// DEV-ONLY — decide whether a swing was filmed in slow motion, and how heavily the
// dataset leans on such frames.
//
// WHY DERIVE IT AND NOT ASK. `slowmo` used to be a per-CLIP checkbox, but a single clip
// can hold both a normal-speed and a slow-motion rep, so the property belongs to the
// SWING, not the file. The one signal that separates them without decoding frame rate
// is how long the swing's envelope lasts: a real swing runs address→finish in ~1.2–2.0 s,
// and slow motion stretches that well past it. The threshold lives here as a named,
// commented constant so it can be moved in one place.
//
// The envelope duration is written into the manifest alongside the derived bool, so the
// threshold can be re-evaluated after the fact without re-extracting (poseinference is
// the minutes-long part; re-deriving a bool from a number in the manifest is free).
//
// Pure: a duration and a mode in, a bool out. No envelope object, no video, no React.

/**
 * SLOW-MOTION THRESHOLD — envelope duration (seconds) above which a swing is treated as
 * slow motion in `auto` mode.
 *
 * A normal-speed swing runs address→finish in ~1.2–2.0 s; slow motion stretches that
 * well beyond. 3.0 s sits above any plausible fast, real-time swing (giving the long
 * back-of-2.0 s a full second of headroom) and below the shortest slow-motion capture,
 * so the two populations do not overlap at the boundary. Revisit with real footage: the
 * per-frame `envelopeDurationSec` in the manifest makes that a re-derivation, not a
 * re-extraction.
 */
export const SLOWMO_ENVELOPE_THRESHOLD_SEC = 3.0;

/**
 * DATASET SLOW-MOTION CAP — the largest share of frames allowed to come from slow-motion
 * swings before the run summary warns (docs/shaft/annotation-spec.md → Slow motion).
 * Slow motion is over-represented on r/GolfSwing and is the easy case for a shaft
 * detector (long exposure per position, little motion blur); letting it dominate the set
 * would train for the wrong regime.
 */
export const SLOWMO_FRAME_CAP_FRAC = 0.15;

/**
 * Per-clip override for the automatic derivation, set in the UI before a run.
 * - `auto` — derive from the swing's envelope duration (the default).
 * - `force-normal` — treat every swing in the clip as normal speed.
 * - `force-slowmo` — treat every swing in the clip as slow motion.
 */
export type SlowmoMode = 'auto' | 'force-normal' | 'force-slowmo';

export const SLOWMO_MODES: SlowmoMode[] = ['auto', 'force-normal', 'force-slowmo'];

/**
 * Whether a swing whose envelope lasts `envelopeDurationSec` is slow motion, under the
 * given override `mode`.
 *
 * `auto` compares against `SLOWMO_ENVELOPE_THRESHOLD_SEC`; the force modes ignore the
 * duration entirely. A non-finite or negative duration under `auto` reads as normal
 * (a swing with no measurable span is not slow motion — it is a bad envelope).
 */
export function deriveSlowmo(envelopeDurationSec: number, mode: SlowmoMode): boolean {
  switch (mode) {
    case 'force-normal':
      return false;
    case 'force-slowmo':
      return true;
    case 'auto':
      return (
        Number.isFinite(envelopeDurationSec) &&
        envelopeDurationSec > SLOWMO_ENVELOPE_THRESHOLD_SEC
      );
  }
}
