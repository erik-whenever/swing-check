import { useState, useEffect, useCallback } from 'react';
import { set, del } from 'idb-keyval';
import type { SwingRecord } from '@swingcheck/core/types';
import {
  isSupabaseEnabled,
  saveSwingToSupabase,
  loadSwingsFromSupabase,
} from '../lib/supabase';
import {
  enforceHistoryMediaCap,
  historyKey,
  readHistoryRecords,
} from '../lib/historyRetention';
import { useSettingsStore } from '../store/settings';
import { createLogger } from '../lib/logger';

const log = createLogger('History');

/**
 * How many swings to fetch from Supabase per load. History is capped by media bytes
 * locally (N-3.5), so this only bounds one metadata query: rows are results + text, a few
 * KB each, so 500 is ~1–2 MB — a full season of range sessions without pagination UI.
 */
// OSÄKER: chosen without a measured row size (Supabase is off until auth lands). Risk: low —
// older swings than the page just don't show while Supabase is the source; local is unbounded.
const REMOTE_PAGE_LIMIT = 500;

/** Supabase when configured (hydrated with local video/frames), otherwise IndexedDB. */
async function readRecords(): Promise<SwingRecord[]> {
  const local = await readHistoryRecords();

  // Prefer Supabase when configured; otherwise IndexedDB is the source of truth.
  if (isSupabaseEnabled()) {
    const remote = await loadSwingsFromSupabase(REMOTE_PAGE_LIMIT);
    if (remote) {
      // Hydrate remote metadata with locally cached video/frames where available.
      const localById = new Map(local.map((r) => [r.id, r]));
      return remote.map((r) => {
        const cached = localById.get(r.id);
        return cached
          ? {
              ...r,
              videoBlob: cached.videoBlob,
              frames: cached.frames,
              videoPurged: cached.videoPurged,
              framesPurged: cached.framesPurged,
            }
          : r;
      });
    }
    // Supabase unavailable/failed → fall through to IndexedDB.
  }

  return local;
}

export function useHistory() {
  const [records, setRecords] = useState<SwingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // State is only set in promise callbacks, so the mount effect can call this directly;
  // `loadRecords` adds the synchronous `setLoading(true)` for later refreshes.
  const fetchRecords = useCallback(
    () =>
      readRecords()
        .then(setRecords)
        .catch((err) => console.error('Failed to load history:', err))
        .finally(() => setLoading(false)),
    []
  );

  const loadRecords = useCallback(async () => {
    setLoading(true);
    await fetchRecords();
  }, [fetchRecords]);

  const saveRecord = useCallback(
    async (record: SwingRecord) => {
      await set(historyKey(record), record);

      // Mirror metadata + results to Supabase when configured (non-blocking, never throws).
      void saveSwingToSupabase(record);

      // Keep media under the byte cap: oldest video first, then frames. Records and their
      // results are never deleted. A failure here must not lose the save above.
      try {
        const purged = await enforceHistoryMediaCap(useSettingsStore.getState().mediaCapMb);
        if (purged > 0) log.info('History media purged to stay under cap', { records: purged });
      } catch (err) {
        log.warn('History media retention failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      await loadRecords();
    },
    [loadRecords]
  );

  const deleteRecord = useCallback(
    async (record: SwingRecord) => {
      await del(historyKey(record));
      await loadRecords();
    },
    [loadRecords]
  );

  // `loading` starts true, so the first load needs no synchronous setLoading.
  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  return { records, loading, saveRecord, deleteRecord, refresh: loadRecords };
}
