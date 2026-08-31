// What SQLite studio keeps on the immediately.run filesystem, all under the
// per-user private store (see store.ts):
//
//   <private>/history.json      — the last 50 queries you ran
//   <private>/saved.json        — named queries
//   <private>/config.json       — the remembered shared space id
//   <private>/databases/*.sqlite — databases saved with "Save to my files"
//
// A shared space (picked through the host powerbox) is listed for *.sqlite|*.db
// files at its root and can be saved into when the grant is read-write.
import fs from 'fs';
import {
  listFiles,
  openPrivateStore,
  openRememberedSpace,
  pickSharedStore,
  readJson,
  writeJson,
  ensureDir,
  removeFile,
  type Store,
} from './store';

export interface HistoryEntry {
  id: string;
  sql: string;
  at: number;
  ms: number;
  rows: number;
  error?: string;
}

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  at: number;
}

interface Config {
  sharedSpaceId?: string;
}

export const HISTORY_LIMIT = 50;
export const DB_EXTENSIONS = ['.sqlite', '.db', '.sqlite3'];

const join = (...p: string[]) => p.join('/').replace(/\/+/g, '/');

let privateStore: Promise<Store> | null = null;
/** The private store, opened once at boot and reused. */
export function getPrivateStore(): Promise<Store> {
  privateStore ??= openPrivateStore('data');
  return privateStore;
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const s = await getPrivateStore();
  return readJson<HistoryEntry[]>(join(s.root, 'history.json'), []);
}

export async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  const s = await getPrivateStore();
  if (s.mode === 'ro') return;
  await writeJson(join(s.root, 'history.json'), entries.slice(0, HISTORY_LIMIT));
}

export async function loadSavedQueries(): Promise<SavedQuery[]> {
  const s = await getPrivateStore();
  return readJson<SavedQuery[]>(join(s.root, 'saved.json'), []);
}

export async function saveSavedQueries(list: SavedQuery[]): Promise<void> {
  const s = await getPrivateStore();
  if (s.mode === 'ro') return;
  await writeJson(join(s.root, 'saved.json'), list);
}

async function loadConfig(): Promise<Config> {
  const s = await getPrivateStore();
  return readJson<Config>(join(s.root, 'config.json'), {});
}

async function saveConfig(c: Config): Promise<void> {
  const s = await getPrivateStore();
  if (s.mode === 'ro') return;
  await writeJson(join(s.root, 'config.json'), c);
}

export interface DbFile {
  name: string;
  path: string;
  size: number;
  /** Where it lives: your private files or the shared space. */
  origin: 'private' | 'shared';
}

const isDbFile = (name: string) => DB_EXTENSIONS.some((e) => name.toLowerCase().endsWith(e));

async function listDbFiles(dir: string, origin: DbFile['origin']): Promise<DbFile[]> {
  const names = (await listFiles(dir)).filter(isDbFile);
  return Promise.all(
    names.map(async (name) => {
      let size = 0;
      try {
        size = (await fs.promises.stat(join(dir, name))).size;
      } catch {
        /* unreadable: show 0 */
      }
      return { name, path: join(dir, name), size, origin };
    }),
  );
}

export async function privateDbDir(): Promise<string> {
  const s = await getPrivateStore();
  return join(s.root, 'databases');
}

export async function listPrivateDbs(): Promise<DbFile[]> {
  return listDbFiles(await privateDbDir(), 'private');
}

export async function listSharedDbs(store: Store): Promise<DbFile[]> {
  return listDbFiles(store.root, 'shared');
}

/** Normalise a user-typed name to `<name>.sqlite` (keeps .db / .sqlite3 if given). */
export function normaliseDbName(name: string): string {
  const clean = name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'database';
  return isDbFile(clean) ? clean : `${clean}.sqlite`;
}

export async function writeDbFile(dir: string, name: string, bytes: Uint8Array): Promise<string> {
  await ensureDir(dir);
  const path = join(dir, normaliseDbName(name));
  await fs.promises.writeFile(path, bytes);
  return path;
}

export async function readDbFile(path: string): Promise<Uint8Array> {
  const data = await fs.promises.readFile(path);
  return data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBufferLike);
}

export const deleteDbFile = removeFile;

/** Re-open the shared space remembered from an earlier visit, without a prompt. */
export async function openRememberedShared(): Promise<Store | null> {
  const cfg = await loadConfig();
  if (!cfg.sharedSpaceId) return null;
  const store = await openRememberedSpace(cfg.sharedSpaceId);
  if (!store) await saveConfig({});
  return store;
}

/** Let the user pick a space in the host powerbox and remember it. Rejects with
 *  `{ code: 'cancelled' }` (or `forbidden` / `auth-required`) when declined. */
export async function chooseShared(): Promise<Store> {
  const store = await pickSharedStore();
  if (store.spaceId) await saveConfig({ sharedSpaceId: store.spaceId });
  return store;
}

export async function forgetShared(): Promise<void> {
  await saveConfig({});
}

export const errorCode = (e: unknown): string | undefined =>
  typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
