import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import {
  deleteDbFile,
  errorCode,
  errorMessage,
  listPrivateDbs,
  listSharedDbs,
  type DbFile,
} from '../lib/persist';
import { pollDir, type Store } from '../lib/store';
import { formatBytes } from '../lib/format';
import { tableNameFromFile } from '../lib/csv';

interface Props {
  onClose: () => void;
  onOpenFile: (file: File) => Promise<void>;
  onOpenPath: (file: DbFile) => Promise<void>;
  onOpenSample: () => Promise<void>;
  onOpenEmpty: () => Promise<void>;
  onImportCsv: (file: File, table: string) => Promise<{ table: string; rows: number }>;
  shared: Store | null;
  onPickShared: () => Promise<void>;
  onForgetShared: () => Promise<void>;
}

function OpenDialog({
  onClose,
  onOpenFile,
  onOpenPath,
  onOpenSample,
  onOpenEmpty,
  onImportCsv,
  shared,
  onPickShared,
  onForgetShared,
}: Props) {
  const [privateFiles, setPrivateFiles] = useState<DbFile[]>([]);
  const [sharedFiles, setSharedFiles] = useState<DbFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvTable, setCsvTable] = useState('');
  const [refresh, setRefresh] = useState(0);
  const csvInput = useRef<HTMLInputElement>(null);
  const dbInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listPrivateDbs()
      .then((f) => {
        if (!cancelled) setPrivateFiles(f);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!shared) return;
    let cancelled = false;
    const load = () =>
      listSharedDbs(shared)
        .then((f) => {
          if (!cancelled) setSharedFiles(f);
        })
        .catch(() => {});
    void load();
    // Other members' writes only show up by polling (no remote watch events).
    const stop = pollDir(shared.root, () => void load(), 3000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [shared, refresh]);

  const run = async (label: string, fn: () => Promise<unknown>, close = true) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      if (close) onClose();
    } catch (e) {
      if (errorCode(e) === 'cancelled') return;
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const onDbFile = (file: File | undefined) => {
    if (!file) return;
    void run(`Opening ${file.name}`, () => onOpenFile(file));
  };

  const onCsvFile = (file: File | undefined) => {
    if (!file) return;
    const table = csvTable.trim() || tableNameFromFile(file.name);
    void run(`Importing ${file.name}`, () => onImportCsv(file, table));
  };

  return (
    <Modal title="Open a database" onClose={onClose}>
      {error && <p className="error">{error}</p>}
      {busy && <p className="hint">{busy}…</p>}

      <div className="open-grid">
        <div className="open-card">
          <h3>From this device</h3>
          <p className="hint">A .sqlite / .db file is read entirely in the browser; nothing is uploaded.</p>
          <input
            ref={dbInput}
            type="file"
            accept=".sqlite,.db,.sqlite3,application/vnd.sqlite3,application/x-sqlite3"
            className="visually-hidden"
            onChange={(e) => {
              onDbFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button className="btn btn-primary btn-sm" type="button" disabled={!!busy} onClick={() => dbInput.current?.click()}>
            Choose a SQLite file
          </button>
        </div>

        <div className="open-card">
          <h3>Start fresh</h3>
          <p className="hint">The sample is a small music store (artists, albums, tracks, invoices) built in memory.</p>
          <div className="row">
            <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => void run('Building sample', onOpenSample)}>
              Sample database
            </button>
            <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => void run('Creating', onOpenEmpty)}>
              Empty database
            </button>
          </div>
        </div>

        <div className="open-card">
          <h3>Import CSV as a table</h3>
          <p className="hint">Adds a table to the current database (or a new one). Types are inferred per column.</p>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            className="visually-hidden"
            onChange={(e) => {
              onCsvFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <div className="row">
            <input
              className="input"
              placeholder="Table name (optional)"
              value={csvTable}
              onChange={(e) => setCsvTable(e.target.value)}
              aria-label="Table name for the imported CSV"
            />
            <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => csvInput.current?.click()}>
              Choose CSV
            </button>
          </div>
        </div>

        <div className="open-card wide">
          <h3>My files</h3>
          <p className="hint">Databases you saved with "Save" live in your private immediately.run files for this app.</p>
          {privateFiles.length === 0 ? (
            <p className="hint dim">Nothing saved yet.</p>
          ) : (
            <ul className="file-list">
              {privateFiles.map((f) => (
                <li key={f.path}>
                  <button type="button" className="file-item" disabled={!!busy} onClick={() => void run(`Opening ${f.name}`, () => onOpenPath(f))}>
                    <span className="file-name">{f.name}</span>
                    <span className="file-size mono">{formatBytes(f.size)}</span>
                  </button>
                  <button
                    type="button"
                    className="q-del"
                    aria-label={`Delete ${f.name}`}
                    onClick={() =>
                      void run(`Deleting ${f.name}`, async () => {
                        await deleteDbFile(f.path);
                        setRefresh((r) => r + 1);
                      }, false)
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="open-card wide">
          <h3>Shared space</h3>
          {shared ? (
            <>
              <p className="hint">
                <b>{shared.name ?? shared.spaceId ?? 'space'}</b> · {shared.mode === 'rw' ? 'read-write' : 'read-only'}.
                Invite people from the platform's Spaces page; the app cannot invite anyone. Updated every few seconds.
              </p>
              {sharedFiles.length === 0 ? (
                <p className="hint dim">No .sqlite / .db files in this space yet.</p>
              ) : (
                <ul className="file-list">
                  {sharedFiles.map((f) => (
                    <li key={f.path}>
                      <button type="button" className="file-item" disabled={!!busy} onClick={() => void run(`Opening ${f.name}`, () => onOpenPath(f))}>
                        <span className="file-name">{f.name}</span>
                        <span className="file-size mono">{formatBytes(f.size)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="row">
                <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => void run('Choosing', onPickShared, false)}>
                  Choose another space
                </button>
                <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => void run('Forgetting', onForgetShared, false)}>
                  Forget this space
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="hint">
                Open a database other people can see. You pick one of your immediately.run spaces; share the space itself from the
                platform's Spaces page.
              </p>
              <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => void run('Choosing', onPickShared, false)}>
                Open a shared space…
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default OpenDialog;
