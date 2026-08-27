import type { TableSummary } from '../lib/sqlite';

interface Props {
  tables: TableSummary[];
  selected: string | null;
  onSelect: (name: string) => void;
  dbName: string;
  loading: boolean;
}

function Sidebar({ tables, selected, onSelect, dbName, loading }: Props) {
  const list = (kind: 'table' | 'view') => tables.filter((t) => t.type === kind);
  const views = list('view');
  return (
    <nav className="sidebar" aria-label="Tables">
      <div className="side-head">
        <span className="side-title">{dbName || 'No database'}</span>
        <span className="side-count mono">
          {tables.length} object{tables.length === 1 ? '' : 's'}
        </span>
      </div>
      {loading && <p className="hint">Loading SQLite engine…</p>}
      {!loading && tables.length === 0 && (
        <p className="hint">No tables yet. Open a file, import a CSV, or run a CREATE TABLE.</p>
      )}
      {list('table').length > 0 && <div className="side-group mono">Tables</div>}
      <ul className="side-list">
        {list('table').map((t) => (
          <li key={t.name}>
            <button type="button" className={`side-item${selected === t.name ? ' on' : ''}`} onClick={() => onSelect(t.name)}>
              <span className="side-name">{t.name}</span>
              <span className="side-rows mono">{t.rowCount === null ? '?' : t.rowCount.toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
      {views.length > 0 && <div className="side-group mono">Views</div>}
      <ul className="side-list">
        {views.map((t) => (
          <li key={t.name}>
            <button type="button" className={`side-item${selected === t.name ? ' on' : ''}`} onClick={() => onSelect(t.name)}>
              <span className="side-name">{t.name}</span>
              <span className="side-rows mono">{t.rowCount === null ? '?' : t.rowCount.toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default Sidebar;
