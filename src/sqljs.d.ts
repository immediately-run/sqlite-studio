// Minimal typings for the pure-JS (asm.js) build of sql.js. We import the
// `dist/sql-asm.js` artifact directly because the immediately.run sandbox
// cannot fetch a `.wasm` binary (CSP), and the asm build needs no fetch at all.
declare module 'sql.js/dist/sql-asm.js' {
  export type SqlValue = number | string | Uint8Array | null;
  export type BindParams = SqlValue[] | Record<string, SqlValue> | null;

  export interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }

  export interface Statement {
    bind(params?: BindParams): boolean;
    step(): boolean;
    get(params?: BindParams): SqlValue[];
    getColumnNames(): string[];
    getAsObject(params?: BindParams): Record<string, SqlValue>;
    run(params?: BindParams): void;
    reset(): void;
    free(): boolean;
  }

  export class Database {
    constructor(data?: Uint8Array | null);
    run(sql: string, params?: BindParams): Database;
    exec(sql: string, params?: BindParams): QueryExecResult[];
    prepare(sql: string, params?: BindParams): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
  }

  const initSqlJs: (config?: Record<string, unknown>) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
