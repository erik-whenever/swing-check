// DEV-ONLY (VITE_DEV_PREVIEW) — shapes for the shaft-annotation dataset export.
//
// Nothing here is imported by the production analysis path. The whole `lib/dataset/`
// folder exists to turn clips into a ZIP a human annotates in CVAT
// (docs/shaft/annotation-spec.md); it reads the production chain, it never feeds it.

/**
 * The seven frame phases from the annotation spec's `phase` attribute.
 *
 * NOT the same set as `SwingPhase` in frameExtractor.ts: the spec splits the code's
 * single `follow-through` into `through` (the club still travelling) and `finish`
 * (the held end position), because those look completely different to a shaft
 * detector — one is a motion streak, the other is a static club behind the head.
 * The mapping lives in `datasetPhase.ts`.
 */
export type ShaftPhase =
  | 'address'
  | 'backswing'
  | 'top'
  | 'downswing'
  | 'impact'
  | 'through'
  | 'finish';

/** Swing order. Every per-phase table in this folder is keyed and reported in it. */
export const SHAFT_PHASES: ShaftPhase[] = [
  'address',
  'backswing',
  'top',
  'downswing',
  'impact',
  'through',
  'finish',
];

/** Where a clip came from — set by hand in the UI before the run, per clip. */
export type ClipSource = 'web' | 'own';

/** The per-frame record written to `manifest.json`. One object per exported JPEG. */
export interface FrameMetadata {
  /**
   * Stable, derived — never random. `frames/<id>.jpg` in the ZIP, and the key an
   * annotation is matched back on after a re-run. See `frameId`.
   */
  id: string;
  /** File name as picked, verbatim (the id carries a slugged + hashed form of it). */
  clipName: string;
  /** 0-based index of the swing within the clip, in time order. */
  swingIndex: number;
  /** 0-based index of the frame within the swing's kept frames, in time order. */
  frameIndex: number;
  /** Grab time in clip seconds. */
  tSec: number;
  phase: ShaftPhase;
  /** The swing envelope this frame was selected from: `[start, finish]` in seconds. */
  envelopeSec: [number, number];
  /** Confident impact in clip seconds, or null when the envelope did not verify one. */
  impactSec: number | null;
  source: ClipSource;
  slowmo: boolean;
  /** Free-text note set per clip in the UI. Empty string when none. */
  notes: string;
}

/** Top level of `manifest.json`. */
export interface DatasetManifest {
  /** Build identity of the app that produced the frames (see `APP_VERSION`). */
  appVersion: string;
  /** ISO 8601, UTC — when the extraction ran. */
  extractedAt: string;
  /** JPEG quality the frames were encoded at. */
  frameQuality: number;
  /** Cap applied per swing after phase culling. */
  maxFramesPerSwing: number;
  /** The target phase weights the cull aimed at, for reference when annotating. */
  phaseTargets: Record<ShaftPhase, number>;
  clipCount: number;
  swingCount: number;
  frameCount: number;
  frames: FrameMetadata[];
}

/**
 * Build identity written into the manifest. `VITE_APP_VERSION` is set by the build
 * (vite.config.ts) to `<package version>+<git sha>`; the fallback keeps the tool
 * usable when it is not.
 */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION || 'dev';

/**
 * STABLE FRAME ID — `<slug>-<hash>_s<swing>_f<frame>`.
 *
 * The requirement is that annotating a frame today and re-running the extractor
 * tomorrow still line up, so nothing random and nothing time-dependent may enter
 * this. The slug is for humans; the 8-hex FNV-1a of the EXACT file name is what
 * makes it safe — two clips named `swing.mov` and `Swing (1).mov` slug to something
 * very similar, and a collision would silently overwrite one clip's frames with
 * another's inside the ZIP.
 */
export function frameId(clipName: string, swingIndex: number, frameIndex: number): string {
  return `${clipKey(clipName)}_s${pad(swingIndex)}_f${pad(frameIndex)}`;
}

/** The clip-identifying half of a frame id, exported for grouping/debug output. */
export function clipKey(clipName: string): string {
  return `${slug(clipName)}-${fnv1a(clipName)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Lowercase ASCII-safe stem. Extension dropped — it is not part of the identity. */
function slug(name: string): string {
  const stem = name.replace(/\.[^./\\]+$/, '');
  const s = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'clip';
}

/** FNV-1a over the code units, 8 hex chars. Same construction as `hashWristSeries`. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (s.charCodeAt(i) >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
