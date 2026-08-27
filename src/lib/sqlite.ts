// Thin layer over sql.js: lazy engine loading, schema introspection, query
// execution with timing, and the read-only guard the "Ask in English" flow
// relies on before it auto-runs model-written SQL.
import type { Database, SqlJsStatic, SqlValue } from '../vendor/sql-asm.js';

export type { Database, SqlValue };

let enginePromise: Promise<SqlJsStatic> | null = null;

/** Load the pure-JS (asm.js) sql.js build once. No `.wasm` fetch — the sandbox
 *  CSP forbids fetching binaries from a CDN, and the asm build is self-contained. */
export function loadEngine(): Promise<SqlJsStatic> {
  enginePromise ??= import('../vendor/sql-asm.js').then((m) => m.default());
  return enginePromise;
}

export async function openDatabase(bytes?: Uint8Array | null): Promise<Database> {
  const SQL = await loadEngine();
  return new SQL.Database(bytes ?? null);
}

export interface QueryResult {
  columns: string[];
  rows: SqlValue[][];
  /** Wall-clock milliseconds spent in `exec`. */
  ms: number;
  /** For statements without a result set: the number of rows changed. */
  rowsModified: number;
  /** True when the statement(s) produced no result set (DDL / DML). */
  isMutation: boolean;
}

/** Run one or more statements. The LAST result set wins (like the sqlite shell). */
export function runQuery(db: Database, sql: string): QueryResult {
  const t0 = performance.now();
  const results = db.exec(sql);
  const ms = performance.now() - t0;
  const last = results[results.length - 1];
  if (!last) {
    return { columns: [], rows: [], ms, rowsModified: db.getRowsModified(), isMutation: true };
  }
  return { columns: last.columns, rows: last.values, ms, rowsModified: 0, isMutation: false };
}

export interface TableSummary {
  name: string;
  type: 'table' | 'view';
  rowCount: number | null;
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: SqlValue;
  pk: number;
}

export const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

export function listTables(db: Database): TableSummary[] {
  const res = db.exec(
    "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name",
  );
  const out: TableSummary[] = [];
  for (const [name, type] of res[0]?.values ?? []) {
    let rowCount: number | null = null;
    try {
      const c = db.exec(`SELECT COUNT(*) FROM ${quoteIdent(String(name))}`);
      rowCount = Number(c[0]?.values[0]?.[0] ?? 0);
    } catch {
      rowCount = null; // a view over a missing table, for instance
    }
    out.push({ name: String(name), type: type === 'view' ? 'view' : 'table', rowCount });
  }
  return out;
}

export function tableColumns(db: Database, table: string): ColumnInfo[] {
  const res = db.exec(`PRAGMA table_info(${quoteIdent(table)})`);
  return (res[0]?.values ?? []).map((r) => ({
    cid: Number(r[0]),
    name: String(r[1]),
    type: String(r[2] ?? ''),
    notNull: Number(r[3]) === 1,
    defaultValue: r[4],
    pk: Number(r[5]),
  }));
}

export function tableSql(db: Database, table: string): string {
  const res = db.exec('SELECT sql FROM sqlite_master WHERE name = ?', [table]);
  return String(res[0]?.values[0]?.[0] ?? '');
}

export interface PageQuery {
  table: string;
  columns: string[];
  page: number;
  pageSize: number;
  sortColumn?: string | null;
  sortDir?: 'asc' | 'desc';
  filter?: string;
}

/** Page through a table at the SQL level so big tables stay cheap to browse. */
export function readPage(db: Database, q: PageQuery): { rows: SqlValue[][]; total: number } {
  const where = q.filter?.trim()
    ? `WHERE ${q.columns.map((c) => `CAST(${quoteIdent(c)} AS TEXT) LIKE ?`).join(' OR ')}`
    : '';
  const params = q.filter?.trim() ? q.columns.map(() => `%${q.filter!.trim()}%`) : [];
  const order = q.sortColumn ? `ORDER BY ${quoteIdent(q.sortColumn)} ${q.sortDir === 'desc' ? 'DESC' : 'ASC'}` : '';
  const total = Number(
    db.exec(`SELECT COUNT(*) FROM ${quoteIdent(q.table)} ${where}`, params)[0]?.values[0]?.[0] ?? 0,
  );
  const res = db.exec(
    `SELECT * FROM ${quoteIdent(q.table)} ${where} ${order} LIMIT ${q.pageSize} OFFSET ${q.page * q.pageSize}`,
    params,
  );
  return { rows: res[0]?.values ?? [], total };
}

/** Everything the model needs to write SQL: DDL plus a few sample rows per table. */
export function describeSchema(db: Database, sampleRows = 3): string {
  const res = db.exec(
    "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type, name",
  );
  const parts: string[] = [];
  for (const [name, type, sql] of res[0]?.values ?? []) {
    parts.push(`-- ${type}: ${name}\n${String(sql)};`);
    if (type !== 'table') continue;
    try {
      const sample = db.exec(`SELECT * FROM ${quoteIdent(String(name))} LIMIT ${sampleRows}`)[0];
      if (sample && sample.values.length) {
        const lines = sample.values.map((row) => row.map(formatCell).join(' | '));
        parts.push(`-- sample rows (${sample.columns.join(' | ')}):\n-- ${lines.join('\n-- ')}`);
      }
    } catch {
      /* unreadable table: skip samples */
    }
  }
  return parts.join('\n\n');
}

/** Human-friendly cell text (blobs and long strings are shortened). */
export function formatCell(v: SqlValue): string {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Uint8Array) return `<blob ${v.length} B>`;
  const s = String(v);
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

const stripLiteralsAndComments = (sql: string): string =>
  sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');

const MUTATING = /\b(insert|update|delete|drop|create|alter|replace|attach|detach|vacuum|reindex|pragma)\b/i;

/** True only for a single statement that starts with SELECT/WITH and contains no
 *  mutating keyword outside string literals and comments. Fail closed. */
export function isReadOnlySql(sql: string): boolean {
  const clean = stripLiteralsAndComments(sql).trim().replace(/;\s*$/, '');
  if (!clean || clean.includes(';')) return false;
  if (!/^(select|with)\b/i.test(clean)) return false;
  return !MUTATING.test(clean);
}

/** Pull the SQL out of a model reply: the first ```sql fence, else the first fence,
 *  else the whole text if it looks like a statement. */
export function extractSql(text: string): string | null {
  const fenced = /```(?:sql|sqlite)?\s*\n([\s\S]*?)```/i.exec(text);
  if (fenced) return fenced[1].trim();
  const trimmed = text.trim();
  return /^(select|with)\b/i.test(trimmed) ? trimmed : null;
}

/** First line (or 60 chars) of a statement, for history and saved-query lists. */
export function sqlTitle(sql: string): string {
  const oneLine = sql.trim().replace(/\s+/g, ' ');
  return oneLine.length > 72 ? `${oneLine.slice(0, 72)}…` : oneLine;
}
