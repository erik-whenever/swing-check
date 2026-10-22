// DEV-ONLY (VITE_DEV_PREVIEW) — the audio side of the Slo-Mo question (S-43).
//
// A Slo-Mo export renders the slowed interval's audio by resampling, so its pitch
// drops by the playback factor. The zero-crossing rate per bin is a crude, decoder-free
// pitch proxy: on the own clips whose telemetry gives the true interval (3550, 3587,
// 3597) it drops by 3.0–4.7× inside the 4× plateau and steps back at its edges. It is a
// fallback observable for files that carry no telemetry track — noisy, not a detector.

export interface AudioBin {
  timeSec: number;
  /** Zero crossings per second / 2 — a rough dominant-frequency proxy, Hz. */
  hz: number;
  db: number;
}

/** Bins quieter than this carry no pitch information (start-of-file silence). */
export const SILENT_DB = -90;

export function zeroCrossingProfile(x: Float32Array, sampleRate: number, binSec = 0.25): AudioBin[] {
  const w = Math.max(1, Math.round(sampleRate * binSec));
  const out: AudioBin[] = [];
  for (let s = 0; s + w <= x.length; s += w) {
    let e = 0;
    let z = 0;
    for (let i = s; i < s + w; i++) {
      e += x[i] * x[i];
      if (i > s && x[i] >= 0 !== x[i - 1] >= 0) z++;
    }
    out.push({
      timeSec: s / sampleRate,
      hz: z / binSec / 2,
      db: 10 * Math.log10(e / w + 1e-12),
    });
  }
  return out;
}

/**
 * Reference pitch from the clip's ends — where a Slo-Mo export plays at 1× — so bins
 * far below it can be flagged as candidate slowed audio. Heuristic; null if the ends
 * are silent.
 */
export function endsReferenceHz(bins: AudioBin[], edgeSec = 0.5): number | null {
  if (bins.length === 0) return null;
  const end = bins[bins.length - 1].timeSec;
  const edge = bins
    .filter((b) => b.db > SILENT_DB && (b.timeSec < edgeSec || b.timeSec > end - edgeSec))
    .map((b) => b.hz)
    .sort((a, b) => a - b);
  return edge.length ? edge[Math.floor(edge.length / 2)] : null;
}

/** Decode the first audio track of a media blob to mono samples (browser only). */
export async function decodeMono(blob: Blob): Promise<{ x: Float32Array; sampleRate: number }> {
  const ctx = new OfflineAudioContext(1, 1, 48000);
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  return { x: audio.getChannelData(0), sampleRate: audio.sampleRate };
}

export interface LowPitchRun {
  startSec: number;
  endSec: number;
  refHz: number;
  insideHz: number;
  /** refHz / insideHz — a rough playback-factor estimate (4× slow-mo read 3.0–4.7). */
  ratio: number;
}

/** A bin is "low" below this fraction of the ends' reference pitch. */
const LOW_FRACTION = 0.5;
/** Gaps of up to this many non-low bins don't break a run (speech/impact transients). */
const MAX_GAP_BINS = 2;

/** Longest run of low-pitch bins — the candidate slowed interval. Heuristic. */
export function lowPitchRun(bins: AudioBin[]): LowPitchRun | null {
  const ref = endsReferenceHz(bins);
  if (ref === null || bins.length < 2) return null;
  const binSec = bins[1].timeSec - bins[0].timeSec;
  const low = bins.map((b) => b.db > SILENT_DB && b.hz < ref * LOW_FRACTION);
  let best: [number, number] | null = null;
  let start = -1;
  let lastLow = -1;
  for (let i = 0; i <= low.length; i++) {
    if (i < low.length && low[i]) {
      if (start < 0 || i - lastLow - 1 > MAX_GAP_BINS) start = i;
      lastLow = i;
      if (!best || lastLow - start > best[1] - best[0]) best = [start, lastLow];
    }
  }
  if (!best) return null;
  const inside = bins
    .slice(best[0], best[1] + 1)
    .filter((b) => b.db > SILENT_DB)
    .map((b) => b.hz)
    .sort((a, b) => a - b);
  const insideHz = inside[Math.floor(inside.length / 2)];
  return {
    startSec: bins[best[0]].timeSec,
    endSec: bins[best[1]].timeSec + binSec,
    refHz: ref,
    insideHz,
    ratio: insideHz > 0 ? ref / insideHz : 0,
  };
}
