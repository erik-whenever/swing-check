// Which swings this evaluation runs on.
//
// Every entry pairs a FROZEN LANDMARK FIXTURE (already in the repo, already the input to
// the pose regression suite) with the VIDEO CLIP it was captured from. The fixture gives
// the frame timings and the crop box without re-running MediaPipe; the clip supplies the
// pixels, which no fixture can. The clips are Erik's own recordings and are not in the
// repo — see docs/experiments/README-vision-eval.md.
//
// `session-multi` contributes three swings on its own (the segmenter finds three), which
// is how five swings come out of three clips.

/** @typedef {{id: string, fixture: string, clip: string, angle: 'down-the-line'|'face-on', mode: 'single'|'session'}} SwingSpec */

/** @type {SwingSpec[]} */
export const DEFAULT_SWINGS = [
  // Angles as documented in src/lib/__fixtures__/README.md.
  { id: 'dtl-full', fixture: 'dtl-full', clip: 'dtl-full', angle: 'down-the-line', mode: 'single' },
  { id: 'face-on', fixture: 'face-on', clip: 'face-on', angle: 'face-on', mode: 'single' },
  // Three swings in one continuous recording. The angle is not recorded anywhere in the
  // repo — override it in experiments/clips/manifest.json if this is wrong. It only
  // affects the CAMERA ANGLE line in the prompt, but that line is stated as
  // authoritative, so a wrong value would be measuring the wrong question.
  { id: 'session-multi', fixture: 'session-multi', clip: 'session-multi', angle: 'down-the-line', mode: 'session' },
];

// dtl-clipped is deliberately EXCLUDED: it ends before impact, so the envelope reports
// `clippedTail` and no confident impact. Production's session path skips exactly such a
// swing (the impact gate, 2026-08-11), so including it would measure a request the app
// never makes.

/**
 * Merge the optional `experiments/clips/manifest.json` over the defaults.
 * The file may set `angle` per swing id, and may add entries.
 */
export function resolveSwings(manifest) {
  if (!manifest || !Array.isArray(manifest.swings)) return DEFAULT_SWINGS;
  const byId = new Map(DEFAULT_SWINGS.map((s) => [s.id, { ...s }]));
  for (const entry of manifest.swings) {
    if (!entry?.id) continue;
    byId.set(entry.id, { ...(byId.get(entry.id) ?? {}), ...entry });
  }
  return [...byId.values()];
}
