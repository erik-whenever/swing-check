// Thin web adapter between the swing history in IndexedDB and core's retention plan
// (N-3.5, replaces MAX_RECORDS = 10). It measures the actual bytes of each record's video
// blob and frames, asks planMediaRetention what to drop, and writes the records back with
// exactly that media emptied and flagged. Results and metadata pass through untouched:
// records are never deleted here. Same policy as apps/mobile/src/mediaStore.ts.

import { get, set, keys } from 'idb-keyval';
import type { SwingRecord } from '@swingcheck/core/types';
import {
  mbToBytes,
  planMediaRetention,
  type MediaFootprint,
} from '@swingcheck/core/lib/mediaRetention';

export const HISTORY_PREFIX = 'swing-';

export function historyKey(record: Pick<SwingRecord, 'id' | 'timestamp'>): string {
  return `${HISTORY_PREFIX}${record.timestamp}-${record.id}`;
}

/**
 * Actual stored bytes of one record's media. Video: the blob's size. Frames: the base64
 * strings exactly as stored (ASCII, one byte per character) — that is what IndexedDB
 * holds, ~4/3 of the decoded JPEG.
 */
export function measureSwingMedia(record: SwingRecord): MediaFootprint {
  return {
    id: record.id,
    timestamp: record.timestamp,
    videoBytes: record.videoBlob?.size ?? 0,
    framesBytes: (record.frames ?? []).reduce((sum, f) => sum + (f?.length ?? 0), 0),
  };
}

/**
 * Apply the retention plan to `records`. Returns ONLY the records that changed, with the
 * dropped media emptied (`videoBlob` → empty Blob, `frames` → []) and flagged.
 */
export function purgeSwingMedia(records: readonly SwingRecord[], capBytes: number): SwingRecord[] {
  const plan = planMediaRetention(records.map(measureSwingMedia), capBytes);
  if (plan.purges.length === 0) return [];
  const byId = new Map(records.map((r) => [r.id, r]));
  const changed: SwingRecord[] = [];
  for (const purge of plan.purges) {
    const record = byId.get(purge.id);
    if (!record) continue;
    const next: SwingRecord = { ...record };
    if (purge.purgeVideo) {
      next.videoBlob = new Blob([]);
      next.videoPurged = true;
    }
    if (purge.purgeFrames) {
      next.frames = [];
      next.framesPurged = true;
    }
    changed.push(next);
  }
  return changed;
}

/** Every swing record in IndexedDB, newest first. */
export async function readHistoryRecords(): Promise<SwingRecord[]> {
  const swingKeys = ((await keys()) as string[])
    .filter((k) => typeof k === 'string' && k.startsWith(HISTORY_PREFIX))
    .sort()
    .reverse();
  const items = await Promise.all(swingKeys.map((k) => get<SwingRecord>(k)));
  return items.filter(Boolean) as SwingRecord[];
}

/**
 * Bring the stored media under `capMb`: video of the oldest swings first, then frames.
 * Returns how many records were rewritten. Records are overwritten in place (same key),
 * never deleted.
 */
export async function enforceHistoryMediaCap(capMb: number): Promise<number> {
  // OSÄKER: every record (frames as base64 strings) is read into memory to be measured.
  // Up to the cap that is fine on desktop; on an older iPhone a full 300 MB of frame-only
  // session swings could pressure the tab. Risk: medium-low — most bytes are video blobs,
  // which the browser keeps file-backed. If it shows up, store media under separate keys.
  const records = await readHistoryRecords();
  const changed = purgeSwingMedia(records, mbToBytes(capMb));
  await Promise.all(changed.map((r) => set(historyKey(r), r)));
  return changed.length;
}
