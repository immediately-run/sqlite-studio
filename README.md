# SQLite studio

Open a SQLite file in the browser, explore it, chart it, and ask questions in
plain English with your own LLM key. Everything runs client-side inside
[immediately.run](https://immediately.run): the database never leaves the
browser tab, and the assistant uses the LLM key *you* connected to the platform
(the app never sees it).

**Try it:** <https://immediately.run/present/github/immediately-run/sqlite-studio/main/files/src/App.tsx>

## What it does

- **Open a database** — pick a `.sqlite` / `.db` / `.sqlite3` file from your
  device, open one you saved earlier ("My files"), open one from a shared
  immediately.run space, start from an empty database, or use the built-in
  sample (a small music store: artists, albums, tracks, customers, invoices —
  about 400 rows generated in memory, so the app works with zero files).
- **Import CSV as a table** — the CSV is parsed in the app (quotes, embedded
  newlines, auto-detected delimiter), column types are inferred
  (INTEGER / REAL / TEXT), and the rows are inserted into a new table.
- **Explore** — a sidebar of tables and views with row counts; click one for its
  columns (type, primary key), the `CREATE` statement, and a paginated grid
  (100 rows per page) with column sort and a quick filter, all done in SQL so
  large tables stay cheap.
- **Query** — a SQL editor (Tab inserts two spaces, ⌘/Ctrl+Enter runs), a
  results grid with sort/filter/paging, error display, execution time, query
  history (last 50) and saved queries. DDL/DML statements work too; the sidebar
  refreshes and the file is marked unsaved.
- **Chart** — pick an X and a numeric Y column of any result and get a bar or
  line chart (plain SVG, no chart library).
- **Ask in English** — type a question; the model gets the full schema
  (`CREATE` statements from `sqlite_master`) plus three sample rows per table,
  answers with a single SQLite `SELECT` in a ```sql block, the SQL is streamed
  into the editor and — only if it is a read-only statement — run automatically
  with the result shown inline. Follow up with "Explain this result" (the
  conversation history and the first rows are sent along). Anything that is not
  a plain `SELECT`/`WITH … SELECT` is shown with a "Run anyway" button instead.
- **Save** — export the database (`db.export()`) to your private files or into
  a shared space you have write access to.
- **Mobile** — at phone widths the app becomes three tabs (Tables / Query /
  Ask); grids scroll horizontally inside their own container.

## How the SQL engine works

The engine is [sql.js](https://sql.js.org) (SQLite compiled to JavaScript).
The app uses the **pure-JS asm.js build** (`dist/sql-asm.js`) rather than the
WebAssembly one, because the immediately.run sandbox cannot fetch a `.wasm`
binary from a CDN (Content Security Policy). The asm build is about 1.3 MB of
JavaScript, loaded lazily the first time a database is opened, with a visible
loading state.

The build is **vendored** as `src/vendor/sql-asm.js` (with three small patches
listed in its header) instead of being imported from the `sql.js` npm package:
the sandbox resolves the dependencies of every file in a fetched package and has
no shim for the `node:fs` / `node:crypto` builtins that Emscripten's Node-only
branch requires, so the package as published cannot be bundled there.

## Where data is stored

All persistence goes through the immediately.run filesystem (`fs`), never
`localStorage`:

| What | Where |
| --- | --- |
| Query history (last 50) | `<private>/history.json` |
| Saved queries | `<private>/saved.json` |
| Remembered shared space | `<private>/config.json` |
| Databases saved with **Save → My files** | `<private>/databases/<name>.sqlite` |
| Databases saved with **Save → Shared space** | `<space root>/<name>.sqlite` |

`<private>` is the per-user, per-app private folder immediately.run gives the
app (the settings mount). Under local `vite dev` the same paths land in
`./devfs-playground/` on disk (git-ignored).

A database opened from your device is held in memory only until you save it.

### Multi-user notes

- "Open → Shared space" asks you to pick one of your immediately.run spaces
  (host powerbox). The app remembers the choice and re-mounts it silently on
  the next visit. **The app cannot invite people** — share the space itself from
  the platform's Spaces page.
- The file list of a shared space is polled every few seconds, so files other
  members save show up without a reload.
- A database is a single file, so saving into a shared space is
  **last-writer-wins**. Coordinate before saving over someone else's copy; the
  save dialog says so.
- Read-only grants are respected: the "Shared" destination is disabled when the
  space is read-only.

## SDK features used

- `@immediately-run/sdk/mounts` — `openSettings`, `requestMount`, `createSpace`,
  `mount` (via `src/lib/store.ts`)
- `@immediately-run/sdk/llm` — `chat` (streaming, `modelHint: 'smart'`,
  `AbortSignal`), `onChatProviderStateChange` (three-state provider gating)
- `fs` (ZenFS surface) — binary read/write of `.sqlite` files, JSON documents,
  directory polling

## Local development

```bash
npm install
npm run dev      # http://localhost:5173 — sample database loads immediately
npm run build    # tsc + vite build
npm run lint     # ESLint incl. the React Fast Refresh rule
```

Under `vite dev` there is no immediately.run host, so the "Ask in English" tab
shows a note instead of a chat; everything else (open, explore, query, chart,
CSV import, save to `devfs-playground/`) works locally.

To exercise the real host (LLM, spaces, consent prompts) without committing:

```bash
npx @immediately-run/cli dev . --origin https://local.immediately.run
```

## License

MIT — see [LICENSE](./LICENSE).
