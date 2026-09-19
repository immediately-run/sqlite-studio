// A small, dependency-free CSV reader plus "import as table" for sql.js.
import type { Database } from 'sql.js/dist/sql-asm.js';
import { quoteIdent } from './sqlite';

export interface ParsedCsv {
  header: string[];
  rows: string[][];
  delimiter: string;
}

function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** RFC-4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string, delimiter?: string): ParsedCsv {
  const d = delimiter ?? detectDelimiter(text.slice(0, 4000));
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.startsWith('﻿') ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === d) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  const header = (nonEmpty.shift() ?? []).map((h, i) => (h.trim() || `column_${i + 1}`));
  return { header: dedupe(header), rows: nonEmpty, delimiter: d };
}

function dedupe(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const count = seen.get(n) ?? 0;
    seen.set(n, count + 1);
    return count ? `${n}_${count + 1}` : n;
  });
}

export type ColumnType = 'INTEGER' | 'REAL' | 'TEXT';

const INT = /^[-+]?\d{1,15}$/;
const REAL = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/** Infer INTEGER / REAL / TEXT per column from the values (empty cells are NULL). */
export function inferTypes(rows: string[][], width: number): ColumnType[] {
  const types: ColumnType[] = [];
  for (let c = 0; c < width; c++) {
    let type: ColumnType = 'INTEGER';
    let sawValue = false;
    for (const r of rows) {
      const v = (r[c] ?? '').trim();
      if (v === '') continue;
      sawValue = true;
      if (type === 'INTEGER' && !INT.test(v)) type = REAL.test(v) ? 'REAL' : 'TEXT';
      else if (type === 'REAL' && !REAL.test(v)) type = 'TEXT';
      if (type === 'TEXT') break;
    }
    types.push(sawValue ? type : 'TEXT');
  }
  return types;
}

/** A safe SQL identifier derived from a file name: `sales 2024.csv` → `sales_2024`. */
export function tableNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  const name = base || 'imported';
  return /^\d/.test(name) ? `t_${name}` : name;
}

/** Create the table and insert every row inside one transaction. Returns row count. */
export function importCsv(db: Database, table: string, csv: ParsedCsv): number {
  const width = csv.header.length;
  const types = inferTypes(csv.rows, width);
  const cols = csv.header.map((h, i) => `${quoteIdent(h)} ${types[i]}`).join(', ');
  db.run(`CREATE TABLE ${quoteIdent(table)} (${cols})`);
  const placeholders = csv.header.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO ${quoteIdent(table)} VALUES (${placeholders})`);
  db.run('BEGIN');
  try {
    for (const r of csv.rows) {
      const values = csv.header.map((_, i) => {
        const raw = (r[i] ?? '').trim();
        if (raw === '') return null;
        if (types[i] === 'INTEGER') return Number.parseInt(raw, 10);
        if (types[i] === 'REAL') return Number.parseFloat(raw);
        return r[i] ?? '';
      });
      stmt.run(values);
    }
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  } finally {
    stmt.free();
  }
  return csv.rows.length;
}

/** Serialise a result set as CSV (used for "Download as CSV" and LLM context). */
export function toCsv(columns: string[], rows: (string | number | null | Uint8Array)[][]): string {
  const esc = (v: string | number | null | Uint8Array): string => {
    const s = v === null ? '' : v instanceof Uint8Array ? `<blob ${v.length} B>` : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}
