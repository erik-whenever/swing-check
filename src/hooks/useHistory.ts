import { useState, useEffect, useCallback } from 'react';
import { get, set, del, keys } from 'idb-keyval';
import type { SwingRecord } from '@swingcheck/core/types';
import {
  isSupabaseEnabled,
  saveSwingToSupabase,
  loadSwingsFromSupabase,
} from '../lib/supabase';

const HISTORY_PREFIX = 'swing-';
const MAX_RECORDS = 10;

/** Read all cached swing records from IndexedDB, newest first, keyed by id for hydration. */
async function readLocalRecords(): Promise<SwingRecord[]> {
  const allKeys = await keys();
  const swingKeys = (allKeys as string[])
    .filter((k) => k.startsWith(HISTORY_PREFIX))
    .sort()
    .reverse()
    .slice(0, MAX_RECORDS);
  const items = await Promise.all(swingKeys.map((k) => get<SwingRecord>(k)));
  return items.filter(Boolean) as SwingRecord[];
}

/** Supabase when configured (hydrated with local video/frames), otherwise IndexedDB. */
async function readRecords(): Promise<SwingRecord[]> {
  const local = await readLocalRecords();

  // Prefer Supabase when configured; otherwise IndexedDB is the source of truth.
  if (isSupabaseEnabled()) {
    const remote = await loadSwingsFromSupabase(MAX_RECORDS);
    if (remote) {
      // Hydrate remote metadata with locally cached video/frames where available.
      const localById = new Map(local.map((r) => [r.id, r]));
      return remote.map((r) => {
        const cached = localById.get(r.id);
        return cached ? { ...r, videoBlob: cached.videoBlob, frames: cached.frames } : r;
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
      const key = `${HISTORY_PREFIX}${record.timestamp}-${record.id}`;
      await set(key, record);

      // Mirror metadata + results to Supabase when configured (non-blocking, never throws).
      void saveSwingToSupabase(record);

      // Prune old records
      const allKeys = await keys();
      const swingKeys = (allKeys as string[])
        .filter((k) => k.startsWith(HISTORY_PREFIX))
        .sort()
        .reverse();

      if (swingKeys.length > MAX_RECORDS) {
        const toDelete = swingKeys.slice(MAX_RECORDS);
        await Promise.all(toDelete.map((k) => del(k)));
      }

      await loadRecords();
    },
    [loadRecords]
  );

  const deleteRecord = useCallback(
    async (record: SwingRecord) => {
      const key = `${HISTORY_PREFIX}${record.timestamp}-${record.id}`;
      await del(key);
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
