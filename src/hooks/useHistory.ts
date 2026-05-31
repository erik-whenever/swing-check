import { useState, useEffect, useCallback } from 'react';
import { get, set, del, keys } from 'idb-keyval';
import type { SwingRecord } from '../types';

const HISTORY_PREFIX = 'swing-';
const MAX_RECORDS = 10;

export function useHistory() {
  const [records, setRecords] = useState<SwingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const allKeys = await keys();
      const swingKeys = (allKeys as string[])
        .filter((k) => k.startsWith(HISTORY_PREFIX))
        .sort()
        .reverse()
        .slice(0, MAX_RECORDS);

      const items = await Promise.all(
        swingKeys.map((k) => get<SwingRecord>(k))
      );
      setRecords(items.filter(Boolean) as SwingRecord[]);
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
