import type { KeyboardEvent } from 'react';

interface Props {
  value: string;
  onChange: (sql: string) => void;
  onRun: () => void;
  placeholder?: string;
}

// A deliberate in-app editor: the SQL here is not a file in a mount (it is a
// transient statement run against an in-memory database), so the platform
// editor cannot own it. Tab inserts two spaces; ⌘/Ctrl+Enter runs.
function SqlEditor({ value, onChange, onRun, placeholder }: Props) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  return (
    <textarea
      className="sql-editor mono"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder ?? 'SELECT * FROM …'}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      aria-label="SQL editor"
      rows={6}
    />
  );
}

export default SqlEditor;
