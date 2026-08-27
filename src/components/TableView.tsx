import { useMemo, useState } from 'react';
import DataGrid from './DataGrid';
import { quoteIdent, readPage, tableColumns, tableSql, type Database } from '../lib/sqlite';

interface Props {
  db: Database;
  table: string;
  kind: 'table' | 'view';
  /** Bumped by the host after mutations so the page is re-read. */
  version: number;
  onQuery: (sql: string) => void;
  onBack?: () => void;
}

const PAGE_SIZE = 100;

function TableView({ db, table, kind, version, onQuery, onBack }: Props) {
  const [page, setPage] = useState(0);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState('');
  const [showSql, setShowSql] = useState(false);
  const [key, setKey] = useState(table);

  // Reset paging/sort/filter when the selected table changes (derived, no effect).
  if (key !== table) {
    setKey(table);
    setPage(0);
    setSortColumn(null);
    setSortDir('asc');
    setFilter('');
  }

  const columns = useMemo(() => {
    void version;
    try {
      return tableColumns(db, table);
    } catch {
      return [];
    }
  }, [db, table, version]);

  const ddl = useMemo(() => {
    void version;
    return tableSql(db, table);
  }, [db, table, version]);

  const data = useMemo(() => {
    void version;
    try {
      return {
        ...readPage(db, {
          table,
          columns: columns.map((c) => c.name),
          page,
          pageSize: PAGE_SIZE,
          sortColumn,
          sortDir,
          filter,
        }),
        error: null as string | null,
      };
    } catch (e) {
      return { rows: [], total: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }, [db, table, columns, page, sortColumn, sortDir, filter, version]);

  const onSort = (c: string) => {
    if (sortColumn === c) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortColumn(c);
      setSortDir('asc');
    }
    setPage(0);
  };

  return (
    <section className="table-view">
      <header className="view-head">
        {onBack && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={onBack}>
            ← Tables
          </button>
        )}
        <h2 className="view-title">
          <span className="kind mono">{kind}</span> {table}
        </h2>
        <div className="view-actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowSql((s) => !s)}>
            {showSql ? 'Hide SQL' : 'Show SQL'}
          </button>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => onQuery(`SELECT *\nFROM ${quoteIdent(table)}\nLIMIT 100;`)}
          >
            Query this {kind}
          </button>
        </div>
      </header>

      <div className="schema">
        {columns.map((c) => (
          <span key={c.cid} className={`col-chip${c.pk ? ' pk' : ''}`} title={c.notNull ? 'NOT NULL' : undefined}>
            {c.pk ? <span className="pk-mark" aria-label="primary key">★</span> : null}
            <span className="col-name">{c.name}</span>
            <span className="col-type mono">{c.type || 'ANY'}</span>
          </span>
        ))}
      </div>

      {showSql && <pre className="ddl mono">{ddl}</pre>}

      {data.error ? (
        <p className="error">{data.error}</p>
      ) : (
        <DataGrid
          columns={columns.map((c) => c.name)}
          rows={data.rows}
          sortColumn={sortColumn}
          sortDir={sortDir}
          onSort={onSort}
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPage={setPage}
          filter={filter}
          onFilter={(v) => {
            setFilter(v);
            setPage(0);
          }}
          emptyText={filter ? 'No rows match the filter.' : 'This table is empty.'}
        />
      )}
    </section>
  );
}

export default TableView;
