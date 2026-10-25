// Swing history is capped by the bytes its media takes, not by a record count (N-3.5,
// replaces the web's MAX_RECORDS = 10). When the cap is exceeded, video goes first —
// oldest swing first — then frames, oldest first. Results and metadata are never touched:
// this module only ever decides which media to drop, and a swing without its video is
// still a full history entry, shown as "video rensad".
//
// Pure: the platform adapter measures the actual bytes on disk and carries out the plan.

/** Conservative default: ~10–30 slow-motion swings at typical iPhone clip sizes. */
export const DEFAULT_MEDIA_CAP_MB = 300;

const BYTES_PER_MB = 1024 * 1024;

export function mbToBytes(mb: number): number {
  return Math.max(0, Math.round(mb * BYTES_PER_MB));
}

/** One swing's media as it stands on disk. Sizes are measured bytes; 0 = nothing stored. */
export interface MediaFootprint {
  id: string;
  /** Recording time (ms). Lower = older = purged first. */
  timestamp: number;
  videoBytes: number;
  framesBytes: number;
}

export interface MediaPurge {
  id: string;
  purgeVideo: boolean;
  purgeFrames: boolean;
}

export interface RetentionPlan {
  /** One entry per swing that loses media; swings left intact are not listed. */
  purges: MediaPurge[];
  totalBytesBefore: number;
  /** Always <= the cap: with every video and frame dropped the total is 0. */
  totalBytesAfter: number;
}

function bytes(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function planMediaRetention(entries: readonly MediaFootprint[], capBytes: number): RetentionPlan {
  const cap = Math.max(0, capBytes);
  // Oldest first; id breaks ties so the plan is deterministic.
  const ordered = [...entries].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  const totalBytesBefore = ordered.reduce((sum, e) => sum + bytes(e.videoBytes) + bytes(e.framesBytes), 0);

  let total = totalBytesBefore;
  const purges = new Map<string, MediaPurge>();
  const mark = (id: string, kind: 'purgeVideo' | 'purgeFrames') => {
    const p = purges.get(id) ?? { id, purgeVideo: false, purgeFrames: false };
    p[kind] = true;
    purges.set(id, p);
  };

  // Pass 1: video, oldest first. Pass 2 (only if still over): frames, oldest first.
  for (const e of ordered) {
    if (total <= cap) break;
    if (bytes(e.videoBytes) === 0) continue;
    total -= bytes(e.videoBytes);
    mark(e.id, 'purgeVideo');
  }
  for (const e of ordered) {
    if (total <= cap) break;
    if (bytes(e.framesBytes) === 0) continue;
    total -= bytes(e.framesBytes);
    mark(e.id, 'purgeFrames');
  }

  // Keep the listing in oldest-first order, matching the order the passes ran in.
  const order = new Map(ordered.map((e, i) => [e.id, i]));
  return {
    purges: [...purges.values()].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
    totalBytesBefore,
    totalBytesAfter: total,
  };
}
