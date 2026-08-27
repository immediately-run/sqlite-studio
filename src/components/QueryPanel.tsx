import { useState } from 'react';
import SqlEditor from './SqlEditor';
import ResultsView from './ResultsView';
import type { QueryResult } from '../lib/sqlite';
import { sqlTitle } from '../lib/sqlite';
import type { HistoryEntry, SavedQuery } from '../lib/persist';
import { formatWhen } from '../lib/format';
import { SAMPLE_QUERIES } from '../lib/sample';

interface Props {
  sql: string;
  onSqlChange: (sql: string) => void;
  onRun: () => void;
  result: QueryResult | null;
  error: string | null;
  history: HistoryEntry[];
  saved: SavedQuery[];
  onSaveQuery: (name: string, sql: string) => void;
  onRemoveSaved: (id: string) => void;
  onClearHistory: () => void;
  isSample: boolean;
  hasDb: boolean;
}

function QueryPanel({
  sql,
  onSqlChange,
  onRun,
  result,
  error,
  history,
  saved,
  onSaveQuery,
  onRemoveSaved,
  onClearHistory,
  isSample,
  hasDb,
}: Props) {
  const [side, setSide] = useState<'history' | 'saved' | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const commitSave = () => {
    const n = name.trim();
    if (!n || !sql.trim()) return;
    onSaveQuery(n, sql);
    setNaming(false);
    setName('');
    setSide('saved');
  };

  return (
    <section className="query-panel">
      <div className="editor-block">
        <SqlEditor value={sql} onChange={onSqlChange} onRun={onRun} />
        <div className="editor-bar">
          <button className="btn btn-primary btn-sm" type="button" onClick={onRun} disabled={!hasDb || !sql.trim()}>
            Run <kbd>⌘↵</kbd>
          </button>
          {naming ? (
            <span className="inline-form">
              <input
                className="input"
                autoFocus
                placeholder="Query name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitSave();
                  if (e.key === 'Escape') setNaming(false);
                }}
              />
              <button className="btn btn-ghost btn-sm" type="button" onClick={commitSave} disabled={!name.trim()}>
                Save
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setNaming(false)}>
                ✕
              </button>
            </span>
          ) : (
            <button className="btn btn-ghost btn-sm" type="button" disabled={!sql.trim()} onClick={() => setNaming(true)}>
              Save query
            </button>
          )}
          <span className="spacer" />
          <div className="seg" role="group" aria-label="Query lists">
            <button type="button" className={side === 'history' ? 'on' : ''} onClick={() => setSide((s) => (s === 'history' ? null : 'history'))}>
              History{history.length ? ` (${history.length})` : ''}
            </button>
            <button type="button" className={side === 'saved' ? 'on' : ''} onClick={() => setSide((s) => (s === 'saved' ? null : 'saved'))}>
              Saved{saved.length ? ` (${saved.length})` : ''}
            </button>
          </div>
        </div>
      </div>

      {side === 'history' && (
        <div className="list-block">
          <div className="list-head">
            <span>Recent queries</span>
            {history.length > 0 && (
              <button className="btn btn-ghost btn-sm" type="button" onClick={onClearHistory}>
                Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="hint">Queries you run show up here (last 50, kept in your private files).</p>
          ) : (
            <ul className="q-list">
              {history.map((h) => (
                <li key={h.id}>
                  <button type="button" className="q-item" onClick={() => onSqlChange(h.sql)}>
                    <span className="q-sql mono">{sqlTitle(h.sql)}</span>
                    <span className={`q-meta${h.error ? ' err' : ''}`}>
                      {h.error ? 'error' : `${h.rows} rows`} · {formatWhen(h.at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {side === 'saved' && (
        <div className="list-block">
          <div className="list-head">
            <span>Saved queries</span>
          </div>
          {saved.length === 0 && !isSample ? (
            <p className="hint">Nothing saved yet. Write a query and press "Save query".</p>
          ) : (
            <ul className="q-list">
              {saved.map((s) => (
                <li key={s.id}>
                  <button type="button" className="q-item" onClick={() => onSqlChange(s.sql)}>
                    <span className="q-name">{s.name}</span>
                    <span className="q-sql mono">{sqlTitle(s.sql)}</span>
                  </button>
                  <button type="button" className="q-del" aria-label={`Delete ${s.name}`} onClick={() => onRemoveSaved(s.id)}>
                    ✕
                  </button>
                </li>
              ))}
              {isSample &&
                SAMPLE_QUERIES.map((s) => (
                  <li key={`sample-${s.name}`}>
                    <button type="button" className="q-item" onClick={() => onSqlChange(s.sql)}>
                      <span className="q-name">
                        {s.name} <span className="tag">example</span>
                      </span>
                      <span className="q-sql mono">{sqlTitle(s.sql)}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {error && <pre className="error mono">{error}</pre>}
      {result && !error && <ResultsView result={result} />}
      {!result && !error && (
        <p className="hint">
          Write SQL above and press Run. {isSample ? 'The "Saved" list has a few example queries for the sample store.' : ''}
        </p>
      )}
    </section>
  );
}

export default QueryPanel;
