// Thin adapter between swing media on disk (expo-file-system) and core's retention plan.
// It measures the actual bytes of each swing's video and frame files, asks
// planMediaRetention what to drop, deletes exactly those files and returns the records
// with the dropped media marked. Results and metadata pass through untouched.
//
// The history store that persists the records themselves is part of N-3.6; this module
// takes and returns plain records so that store can call it after every save.

import {
  DEFAULT_MEDIA_CAP_MB,
  mbToBytes,
  planMediaRetention,
  type MediaFootprint,
} from '@swingcheck/core/lib/mediaRetention';
import { File } from 'expo-file-system';

export interface StoredSwingMedia {
  id: string;
  timestamp: number;
  /** null once purged (or never stored). */
  videoUri: string | null;
  frameUris: string[];
  /** Set when retention dropped the video — the history shows "video rensad". */
  videoPurged?: boolean;
  framesPurged?: boolean;
}

function fileBytes(uri: string): number {
  try {
    const file = new File(uri);
    return file.exists ? (file.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

/** Actual on-disk bytes of one swing's media. */
export function measureMedia(record: StoredSwingMedia): MediaFootprint {
  return {
    id: record.id,
    timestamp: record.timestamp,
    videoBytes: record.videoUri ? fileBytes(record.videoUri) : 0,
    framesBytes: record.frameUris.reduce((sum, uri) => sum + fileBytes(uri), 0),
  };
}

/** Delete a file; false when it is still there afterwards. A missing file counts as deleted. */
function deleteFile(uri: string): boolean {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
    return true;
  } catch {
    return false;
  }
}

/**
 * Bring the media under `capMb` (a user setting; default DEFAULT_MEDIA_CAP_MB): video of
 * the oldest swings first, then their frames. Returns every record, in the given order,
 * with purged media cleared and flagged. A file that fails to delete keeps its URI, so
 * the record never claims media is gone while it is still on disk.
 */
export function enforceMediaCap<T extends StoredSwingMedia>(
  records: readonly T[],
  capMb: number = DEFAULT_MEDIA_CAP_MB,
): T[] {
  const plan = planMediaRetention(records.map(measureMedia), mbToBytes(capMb));
  if (plan.purges.length === 0) return [...records];
  const byId = new Map(plan.purges.map((p) => [p.id, p]));

  return records.map((record) => {
    const purge = byId.get(record.id);
    if (!purge) return record;
    const next: T = { ...record };
    if (purge.purgeVideo && record.videoUri && deleteFile(record.videoUri)) {
      next.videoUri = null;
      next.videoPurged = true;
    }
    if (purge.purgeFrames) {
      const kept = record.frameUris.filter((uri) => !deleteFile(uri));
      next.frameUris = kept;
      if (kept.length === 0) next.framesPurged = true;
    }
    return next;
  });
}
