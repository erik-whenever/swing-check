import { useState, useEffect, useCallback } from 'react';
import { get, set, del, keys } from 'idb-keyval';
import type { SwingRecord } from '../types';
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

export function useHistory() {
  const [records, setRecords] = useState<SwingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const local = await readLocalRecords();

      // Prefer Supabase when configured; otherwise IndexedDB is the source of truth.
      if (isSupabaseEnabled()) {
        const remote = await loadSwingsFromSupabase(MAX_RECORDS);
        if (remote) {
          // Hydrate remote metadata with locally cached video/frames where available.
          const localById = new Map(local.map((r) => [r.id, r]));
          const merged = remote.map((r) => {
            const cached = localById.get(r.id);
            return cached ? { ...r, videoBlob: cached.videoBlob, frames: cached.frames } : r;
          });
          setRecords(merged);
          return;
        }
        // Supabase unavailable/failed → fall through to IndexedDB.
      }

      setRecords(local);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  return { records, loading, saveRecord, deleteRecord, refresh: loadRecords };
}
