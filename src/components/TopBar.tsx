import ThemeSwitch from './ThemeSwitch';

interface Props {
  dbName: string;
  dirty: boolean;
  hasDb: boolean;
  onOpen: () => void;
  onSave: () => void;
}

function TopBar({ dbName, dirty, hasDb, onOpen, onSave }: Props) {
  return (
    <header className="topbar">
      <div className="logo">
        <span className="mark" aria-hidden="true" />
        <span className="logo-text">
          SQLite <span className="grad-text">studio</span>
        </span>
      </div>
      {hasDb && (
        <span className="db-pill mono" title={dirty ? 'Unsaved changes' : 'Saved'}>
          {dbName}
          {dirty ? <span className="dirty" aria-label="unsaved changes">●</span> : null}
        </span>
      )}
      <div className="top-actions">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onOpen}>
          Open
        </button>
        <button className="btn btn-primary btn-sm" type="button" onClick={onSave} disabled={!hasDb}>
          Save
        </button>
        <ThemeSwitch />
      </div>
    </header>
  );
}

export default TopBar;
