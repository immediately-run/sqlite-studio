import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listTables,
  openDatabase,
  runQuery,
  type Database,
  type QueryResult,
  type TableSummary,
} from '../lib/sqlite';
import { importCsv, parseCsv, tableNameFromFile } from '../lib/csv';
import { buildSampleDatabase, SAMPLE_DB_NAME } from '../lib/sample';

export interface DatabaseState {
  db: Database | null;
  /** File name shown in the top bar. */
  name: string;
  /** True while the sql.js engine is being loaded for the first time. */
  loading: boolean;
  /** Set when the engine failed to load — the app cannot do anything then. */
  engineError: string | null;
  tables: TableSummary[];
  /** Bumped after every mutation so dependent views refetch. */
  version: number;
  /** True when there are changes not yet saved anywhere. */
  dirty: boolean;
  /** Where the current database came from (to offer "save back"). */
  sourcePath: string | null;
}

export interface DatabaseActions {
  openBytes: (bytes: Uint8Array, name: string, sourcePath?: string | null) => Promise<void>;
  openSample: () => Promise<void>;
  openEmpty: (name?: string) => Promise<void>;
  importCsvText: (text: string, fileName: string, table?: string) => Promise<{ table: string; rows: number }>;
  /** Execute SQL; returns the result or throws the SQLite error. */
  exec: (sql: string) => QueryResult;
  exportBytes: () => Uint8Array;
  markSaved: (sourcePath: string | null, name?: string) => void;
}

export function useDatabase(): [DatabaseState, DatabaseActions] {
  const [db, setDb] = useState<Database | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const dbRef = useRef<Database | null>(null);

  const refreshTables = useCallback((d: Database) => {
    try {
      setTables(listTables(d));
    } catch {
      setTables([]);
    }
  }, []);

  const install = useCallback(
    (d: Database, n: string, src: string | null, isDirty: boolean) => {
      dbRef.current?.close();
      dbRef.current = d;
      setDb(d);
      setName(n);
      setSourcePath(src);
      setDirty(isDirty);
      refreshTables(d);
      setVersion((v) => v + 1);
    },
    [refreshTables],
  );

  const withEngine = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setLoading(true);
    try {
      const r = await fn();
      setEngineError(null);
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setEngineError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const openBytes = useCallback(
    async (bytes: Uint8Array, n: string, src: string | null = null) => {
      await withEngine(async () => {
        const d = await openDatabase(bytes);
        // Validate it really is a SQLite file before swapping it in.
        d.exec('SELECT count(*) FROM sqlite_master');
        install(d, n, src, false);
      });
    },
    [install, withEngine],
  );

  const openSample = useCallback(async () => {
    await withEngine(async () => {
      const d = await openDatabase(null);
      buildSampleDatabase(d);
      install(d, SAMPLE_DB_NAME, null, false);
    });
  }, [install, withEngine]);

  const openEmpty = useCallback(
    async (n = 'untitled.sqlite') => {
      await withEngine(async () => {
        const d = await openDatabase(null);
        install(d, n, null, false);
      });
    },
    [install, withEngine],
  );

  const importCsvText = useCallback(
    async (text: string, fileName: string, table?: string) => {
      let d = dbRef.current;
      if (!d) {
        d = await withEngine(() => openDatabase(null));
        install(d, 'untitled.sqlite', null, false);
      }
      const parsed = parseCsv(text);
      const tableName = table?.trim() || tableNameFromFile(fileName);
      const rows = importCsv(d, tableName, parsed);
      refreshTables(d);
      setDirty(true);
      setVersion((v) => v + 1);
      return { table: tableName, rows };
    },
    [install, refreshTables, withEngine],
  );

  const exec = useCallback(
    (sql: string): QueryResult => {
      const d = dbRef.current;
      if (!d) throw new Error('No database is open');
      const result = runQuery(d, sql);
      if (result.isMutation) {
        refreshTables(d);
        setDirty(true);
        setVersion((v) => v + 1);
      }
      return result;
    },
    [refreshTables],
  );

  const exportBytes = useCallback((): Uint8Array => {
    const d = dbRef.current;
    if (!d) throw new Error('No database is open');
    return d.export();
  }, []);

  const markSaved = useCallback((src: string | null, n?: string) => {
    setSourcePath(src);
    if (n) setName(n);
    setDirty(false);
  }, []);

  useEffect(() => () => dbRef.current?.close(), []);

  return [
    { db, name, loading, engineError, tables, version, dirty, sourcePath },
    { openBytes, openSample, openEmpty, importCsvText, exec, exportBytes, markSaved },
  ];
}
