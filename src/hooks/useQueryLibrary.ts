import { useCallback, useEffect, useState } from 'react';
import {
  HISTORY_LIMIT,
  loadHistory,
  loadSavedQueries,
  saveHistory,
  saveSavedQueries,
  type HistoryEntry,
  type SavedQuery,
} from '../lib/persist';
import { newId } from '../lib/store';

/** Query history (last 50) and saved queries, persisted in the private store. */
export function useQueryLibrary() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [saved, setSaved] = useState<SavedQuery[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [h, s] = await Promise.all([loadHistory(), loadSavedQueries()]);
      if (cancelled) return;
      setHistory(h);
      setSaved(s);
      setReady(true);
    })().catch(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const addHistory = useCallback((entry: Omit<HistoryEntry, 'id' | 'at'>) => {
    setHistory((prev) => {
      const next = [{ ...entry, id: newId(), at: Date.now() }, ...prev.filter((h) => h.sql !== entry.sql)].slice(
        0,
        HISTORY_LIMIT,
      );
      void saveHistory(next).catch(() => {});
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    void saveHistory([]).catch(() => {});
  }, []);

  const saveQuery = useCallback((name: string, sql: string) => {
    setSaved((prev) => {
      const next = [{ id: newId(), name, sql, at: Date.now() }, ...prev.filter((s) => s.name !== name)];
      void saveSavedQueries(next).catch(() => {});
      return next;
    });
  }, []);

  const removeSaved = useCallback((id: string) => {
    setSaved((prev) => {
      const next = prev.filter((s) => s.id !== id);
      void saveSavedQueries(next).catch(() => {});
      return next;
    });
  }, []);

  return { ready, history, saved, addHistory, clearHistory, saveQuery, removeSaved };
}
