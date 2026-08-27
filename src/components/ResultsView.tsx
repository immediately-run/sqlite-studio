import { useMemo, useState } from 'react';
import DataGrid from './DataGrid';
import ChartPanel from './ChartPanel';
import type { QueryResult, SqlValue } from '../lib/sqlite';
import { formatCell } from '../lib/sqlite';
import { formatMs } from '../lib/format';
import { toCsv } from '../lib/csv';

interface Props {
  result: QueryResult;
  /** Offer the chart toggle (off for the compact chat embedding). */
  chartable?: boolean;
  compact?: boolean;
}

const PAGE_SIZE = 100;

const compare = (a: SqlValue, b: SqlValue): number => {
  if (a === null) return b === null ? 0 : -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(formatCell(a)).localeCompare(String(formatCell(b)), undefined, { numeric: true });
};

function ResultsView({ result, chartable = true, compact = false }: Props) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [showChart, setShowChart] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [key, setKey] = useState(result);

  if (key !== result) {
    setKey(result);
    setSortColumn(null);
    setFilter('');
    setPage(0);
  }

  const rows = useMemo(() => {
    let out = result.rows;
    const f = filter.trim().toLowerCase();
    if (f) out = out.filter((r) => r.some((v) => formatCell(v).toLowerCase().includes(f)));
    const idx = sortColumn ? result.columns.indexOf(sortColumn) : -1;
    if (idx >= 0) {
      out = [...out].sort((a, b) => (sortDir === 'asc' ? 1 : -1) * compare(a[idx], b[idx]));
    }
    return out;
  }, [result, filter, sortColumn, sortDir]);

  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const copyCsv = async () => {
    try {
      await navigator.clipboard.writeText(toCsv(result.columns, rows));
      setCopied('Copied');
    } catch {
      setCopied('Clipboard unavailable');
    }
    setTimeout(() => setCopied(null), 1500);
  };

  if (result.isMutation) {
    return (
      <p className="status ok">
        ✓ Done in {formatMs(result.ms)} · {result.rowsModified.toLocaleString()} row{result.rowsModified === 1 ? '' : 's'} changed
      </p>
    );
  }

  return (
    <div className="results">
      <div className="results-bar">
        <span className="status ok">
          ✓ {result.rows.length.toLocaleString()} row{result.rows.length === 1 ? '' : 's'} in {formatMs(result.ms)}
        </span>
        <span className="spacer" />
        {!compact && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={copyCsv}>
            {copied ?? 'Copy CSV'}
          </button>
        )}
        {chartable && result.rows.length > 0 && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowChart((s) => !s)}>
            {showChart ? 'Hide chart' : 'Chart'}
          </button>
        )}
      </div>
      {showChart && chartable && <ChartPanel columns={result.columns} rows={rows} />}
      <DataGrid
        columns={result.columns}
        rows={pageRows}
        sortColumn={sortColumn}
        sortDir={sortDir}
        onSort={(c) => {
          if (sortColumn === c) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
          else {
            setSortColumn(c);
            setSortDir('asc');
          }
          setPage(0);
        }}
        page={page}
        pageSize={PAGE_SIZE}
        total={rows.length}
        onPage={setPage}
        filter={filter}
        onFilter={(v) => {
          setFilter(v);
          setPage(0);
        }}
        emptyText={filter ? 'No rows match the filter.' : 'The query returned no rows.'}
        compact={compact}
      />
    </div>
  );
}

export default ResultsView;
