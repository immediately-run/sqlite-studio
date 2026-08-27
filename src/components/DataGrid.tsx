import type { SqlValue } from '../lib/sqlite';
import { formatCell } from '../lib/sqlite';

interface Props {
  columns: string[];
  rows: SqlValue[][];
  sortColumn?: string | null;
  sortDir?: 'asc' | 'desc';
  onSort?: (column: string) => void;
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  filter?: string;
  onFilter?: (value: string) => void;
  emptyText?: string;
  /** Fewer controls, for embedding under a chat answer. */
  compact?: boolean;
}

const cellClass = (v: SqlValue): string =>
  v === null ? 'cell null' : typeof v === 'number' ? 'cell num' : v instanceof Uint8Array ? 'cell blob' : 'cell';

function DataGrid({
  columns,
  rows,
  sortColumn,
  sortDir,
  onSort,
  page,
  pageSize,
  total,
  onPage,
  filter,
  onFilter,
  emptyText = 'No rows.',
  compact = false,
}: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className={`grid${compact ? ' compact' : ''}`}>
      {(onFilter || pageCount > 1 || !compact) && (
        <div className="grid-bar">
          {onFilter && (
            <input
              className="input grid-filter"
              type="search"
              placeholder="Quick filter"
              value={filter ?? ''}
              onChange={(e) => onFilter(e.target.value)}
              aria-label="Quick filter"
            />
          )}
          <span className="grid-count mono">
            {total === 0 ? '0 rows' : `${from}–${to} of ${total.toLocaleString()}`}
          </span>
          {pageCount > 1 && (
            <span className="pager">
              <button className="btn btn-ghost btn-sm" type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>
                ←
              </button>
              <span className="mono">
                {page + 1} / {pageCount}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                disabled={page >= pageCount - 1}
                onClick={() => onPage(page + 1)}
              >
                →
              </button>
            </span>
          )}
        </div>
      )}
      <div className="grid-scroll">
        {columns.length === 0 || rows.length === 0 ? (
          <p className="grid-empty">{emptyText}</p>
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>
                    {onSort ? (
                      <button type="button" className="th-btn" onClick={() => onSort(c)}>
                        {c}
                        {sortColumn === c && <span className="sort-ind">{sortDir === 'desc' ? '▾' : '▴'}</span>}
                      </button>
                    ) : (
                      c
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} className={cellClass(v)} title={v === null ? undefined : String(formatCell(v))}>
                      {formatCell(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default DataGrid;
