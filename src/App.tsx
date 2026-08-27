// Root component — immediately.run renders the default export of THIS file.
// Global CSS is imported here (not in main.tsx) because immediately.run's
// runtime never loads main.tsx; anything the rendered tree needs must be
// reachable from App.tsx.
import './index.css';
import './App.css';
import { useCallback, useEffect, useState } from 'react';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import TableView from './components/TableView';
import QueryPanel from './components/QueryPanel';
import AskPanel, { type RunOutcome } from './components/AskPanel';
import OpenDialog from './components/OpenDialog';
import SaveDialog from './components/SaveDialog';
import { useDatabase } from './hooks/useDatabase';
import { useQueryLibrary } from './hooks/useQueryLibrary';
import { useIsNarrow } from './hooks/useIsNarrow';
import type { QueryResult } from './lib/sqlite';
import { SAMPLE_DB_NAME } from './lib/sample';
import {
  chooseShared,
  errorMessage,
  forgetShared,
  getPrivateStore,
  openRememberedShared,
  privateDbDir,
  readDbFile,
  writeDbFile,
  type DbFile,
} from './lib/persist';
import type { Store } from './lib/store';

type View = 'tables' | 'query' | 'ask';

function App() {
  const [state, actions] = useDatabase();
  const library = useQueryLibrary();
  const narrow = useIsNarrow();

  const [view, setView] = useState<View>('tables');
  const [selected, setSelected] = useState<string | null>(null);
  const [listMode, setListMode] = useState(true);
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'open' | 'save' | null>(null);
  const [shared, setShared] = useState<Store | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Boot: open the private store first (and keep it), re-mount a remembered
  // shared space silently, then load the sample so the app is usable at once.
  useEffect(() => {
    void getPrivateStore()
      .then(() => openRememberedShared())
      .then((s) => {
        if (s) setShared(s);
      })
      .catch(() => {});
    void actions.openSample().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // The effective selection is derived so it stays valid when tables change
  // (e.g. after DROP TABLE) without an effect.
  const selectedTable =
    state.tables.find((t) => t.name === selected) ?? (state.tables.length ? state.tables[0] : null);

  const runSql = useCallback(
    (text: string): RunOutcome => {
      const trimmed = text.trim();
      if (!trimmed) return {};
      try {
        const r = actions.exec(trimmed);
        setResult(r);
        setQueryError(null);
        library.addHistory({ sql: trimmed, ms: r.ms, rows: r.isMutation ? r.rowsModified : r.rows.length });
        return { result: r };
      } catch (e) {
        const msg = errorMessage(e);
        setResult(null);
        setQueryError(msg);
        library.addHistory({ sql: trimmed, ms: 0, rows: 0, error: msg });
        return { error: msg };
      }
    },
    [actions, library],
  );

  const runEditor = useCallback(() => {
    runSql(sql);
  }, [runSql, sql]);

  const showInEditor = useCallback((text: string) => {
    setSql(text);
  }, []);

  const openInQuery = (text: string) => {
    setSql(text);
    setView('query');
    runSql(text);
  };

  const pickShared = async () => {
    const s = await chooseShared();
    setShared(s);
  };

  const forget = async () => {
    await forgetShared();
    setShared(null);
  };

  const openFile = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await actions.openBytes(bytes, file.name, null);
    setView('tables');
    setListMode(true);
    setResult(null);
    setQueryError(null);
  };

  const openPath = async (f: DbFile) => {
    const bytes = await readDbFile(f.path);
    await actions.openBytes(bytes, f.name, f.path);
    setView('tables');
    setListMode(true);
    setResult(null);
    setQueryError(null);
  };

  const importCsv = async (file: File, table: string) => {
    const out = await actions.importCsvText(await file.text(), file.name, table);
    setSelected(out.table);
    setListMode(false);
    setView('tables');
    setToast(`Imported ${out.rows.toLocaleString()} rows into ${out.table}`);
    return out;
  };

  const save = async (dest: 'private' | 'shared', name: string) => {
    const bytes = actions.exportBytes();
    const dir = dest === 'shared' ? shared?.root : await privateDbDir();
    if (!dir) throw new Error('No shared space is open');
    const path = await writeDbFile(dir, name, bytes);
    actions.markSaved(path, name);
    setToast(`Saved ${name} to ${dest === 'shared' ? (shared?.name ?? 'the shared space') : 'my files'}`);
  };

  const showTableList = !narrow || listMode || !selectedTable;

  const mainView =
    view === 'query' ? (
      <QueryPanel
        sql={sql}
        onSqlChange={setSql}
        onRun={runEditor}
        result={result}
        error={queryError}
        history={library.history}
        saved={library.saved}
        onSaveQuery={library.saveQuery}
        onRemoveSaved={library.removeSaved}
        onClearHistory={library.clearHistory}
        isSample={state.name === SAMPLE_DB_NAME}
        hasDb={!!state.db}
      />
    ) : view === 'ask' ? (
      <AskPanel db={state.db} dbName={state.name} version={state.version} runSql={runSql} onShowInEditor={showInEditor} />
    ) : state.db && selectedTable && !(narrow && listMode) ? (
      <TableView
        db={state.db}
        table={selectedTable.name}
        kind={selectedTable.type}
        version={state.version}
        onQuery={openInQuery}
        onBack={narrow ? () => setListMode(true) : undefined}
      />
    ) : (
      <div className="empty-main">
        {state.engineError ? (
          <p className="error">The SQLite engine failed to load: {state.engineError}</p>
        ) : state.loading ? (
          <p className="hint">
            <span className="spinner" aria-hidden="true" /> Loading SQLite…
          </p>
        ) : (
          <p className="hint">Pick a table on the left, or open a file.</p>
        )}
      </div>
    );

  return (
    <div className={`app${narrow ? ' narrow' : ''}`}>
      <TopBar dbName={state.name} dirty={state.dirty} hasDb={!!state.db} onOpen={() => setDialog('open')} onSave={() => setDialog('save')} />

      <div className="tabs" role="tablist" aria-label="Sections">
        {(['tables', 'query', 'ask'] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={`tab${view === v ? ' on' : ''}`}
            onClick={() => setView(v)}
          >
            {v === 'tables' ? 'Tables' : v === 'query' ? 'Query' : 'Ask in English'}
          </button>
        ))}
      </div>

      <div className="body">
        {(!narrow || (view === 'tables' && showTableList)) && (
          <Sidebar
            tables={state.tables}
            selected={selected}
            dbName={state.name}
            loading={state.loading}
            onSelect={(n) => {
              setSelected(n);
              setListMode(false);
              setView('tables');
            }}
          />
        )}
        <main className="main">{narrow && view === 'tables' && showTableList ? null : mainView}</main>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {dialog === 'open' && (
        <OpenDialog
          onClose={() => setDialog(null)}
          onOpenFile={openFile}
          onOpenPath={openPath}
          onOpenSample={async () => {
            await actions.openSample();
            setResult(null);
            setQueryError(null);
            setView('tables');
            setListMode(true);
          }}
          onOpenEmpty={async () => {
            await actions.openEmpty();
            setResult(null);
            setQueryError(null);
            setSql('CREATE TABLE notes (\n  id INTEGER PRIMARY KEY,\n  title TEXT NOT NULL,\n  body TEXT\n);');
            setView('query');
          }}
          onImportCsv={importCsv}
          shared={shared}
          onPickShared={pickShared}
          onForgetShared={forget}
        />
      )}
      {dialog === 'save' && state.db && (
        <SaveDialog defaultName={state.name} shared={shared} onPickShared={pickShared} onSave={save} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

export default App;
