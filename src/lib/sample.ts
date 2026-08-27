// Builds the built-in sample database at runtime from src/data/sample.ts. The
// generator is seeded so every visitor sees the same ~300 rows, which keeps
// the README examples reproducible.
import type { Database } from '../vendor/sql-asm.js';
import { ARTISTS, CUSTOMERS, GENRES, TRACK_WORDS_A, TRACK_WORDS_B } from '../data/sample';

/** Tiny deterministic PRNG (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SAMPLE_DB_NAME = 'music-store.sqlite';

export const SAMPLE_SCHEMA = `
CREATE TABLE genres (
  genre_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE artists (
  artist_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT
);
CREATE TABLE albums (
  album_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  artist_id INTEGER NOT NULL REFERENCES artists(artist_id),
  genre_id INTEGER REFERENCES genres(genre_id),
  release_year INTEGER
);
CREATE TABLE tracks (
  track_id INTEGER PRIMARY KEY,
  album_id INTEGER NOT NULL REFERENCES albums(album_id),
  track_no INTEGER NOT NULL,
  name TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  unit_price REAL NOT NULL DEFAULT 0.99
);
CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  city TEXT,
  country TEXT
);
CREATE TABLE invoices (
  invoice_id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
  invoice_date TEXT NOT NULL,
  total REAL NOT NULL
);
CREATE TABLE invoice_items (
  item_id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(invoice_id),
  track_id INTEGER NOT NULL REFERENCES tracks(track_id),
  unit_price REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1
);
CREATE VIEW album_sales AS
  SELECT al.album_id, al.title AS album, ar.name AS artist, g.name AS genre,
         COUNT(ii.item_id) AS items_sold,
         ROUND(SUM(ii.unit_price * ii.quantity), 2) AS revenue
  FROM albums al
  JOIN artists ar ON ar.artist_id = al.artist_id
  LEFT JOIN genres g ON g.genre_id = al.genre_id
  LEFT JOIN tracks t ON t.album_id = al.album_id
  LEFT JOIN invoice_items ii ON ii.track_id = t.track_id
  GROUP BY al.album_id;
`;

/** Populate an empty database with the sample music store. */
export function buildSampleDatabase(db: Database): void {
  const rnd = seeded(20260827);
  db.run('BEGIN');
  db.run(SAMPLE_SCHEMA);

  const genreId = new Map<string, number>();
  const genreStmt = db.prepare('INSERT INTO genres (name) VALUES (?)');
  GENRES.forEach((g, i) => {
    genreStmt.run([g]);
    genreId.set(g, i + 1);
  });
  genreStmt.free();

  const artistStmt = db.prepare('INSERT INTO artists (name, country) VALUES (?, ?)');
  const albumStmt = db.prepare(
    'INSERT INTO albums (title, artist_id, genre_id, release_year) VALUES (?, ?, ?, ?)',
  );
  const trackStmt = db.prepare(
    'INSERT INTO tracks (album_id, track_no, name, duration_ms, unit_price) VALUES (?, ?, ?, ?, ?)',
  );
  let artistId = 0;
  let albumId = 0;
  let trackCount = 0;
  for (const a of ARTISTS) {
    artistStmt.run([a.name, a.country]);
    artistId++;
    for (const al of a.albums) {
      albumStmt.run([al.title, artistId, genreId.get(al.genre) ?? null, al.year]);
      albumId++;
      for (let n = 1; n <= al.tracks; n++) {
        const w1 = TRACK_WORDS_A[Math.floor(rnd() * TRACK_WORDS_A.length)];
        const w2 = TRACK_WORDS_B[Math.floor(rnd() * TRACK_WORDS_B.length)];
        const duration = 120_000 + Math.floor(rnd() * 300_000);
        const price = al.genre === 'Classical' ? 1.29 : 0.99;
        trackStmt.run([albumId, n, `${w1} ${w2}`, duration, price]);
        trackCount++;
      }
    }
  }
  artistStmt.free();
  albumStmt.free();
  trackStmt.free();

  const customerStmt = db.prepare(
    'INSERT INTO customers (first_name, last_name, email, city, country) VALUES (?, ?, ?, ?, ?)',
  );
  for (const c of CUSTOMERS) {
    const email = `${c.first}.${c.last}@example.com`.toLowerCase();
    customerStmt.run([c.first, c.last, email, c.city, c.country]);
  }
  customerStmt.free();

  const invoiceStmt = db.prepare(
    'INSERT INTO invoices (customer_id, invoice_date, total) VALUES (?, ?, ?)',
  );
  const itemStmt = db.prepare(
    'INSERT INTO invoice_items (invoice_id, track_id, unit_price, quantity) VALUES (?, ?, ?, ?)',
  );
  const priceOf = db.prepare('SELECT unit_price FROM tracks WHERE track_id = ?');
  const invoiceCount = 48;
  for (let i = 1; i <= invoiceCount; i++) {
    const customer = 1 + Math.floor(rnd() * CUSTOMERS.length);
    const day = new Date(Date.UTC(2024, 0, 1) + Math.floor(rnd() * 540) * 86_400_000);
    const date = day.toISOString().slice(0, 10);
    const lines = 1 + Math.floor(rnd() * 4);
    let total = 0;
    const items: [number, number, number][] = [];
    for (let l = 0; l < lines; l++) {
      const track = 1 + Math.floor(rnd() * trackCount);
      const qty = rnd() < 0.85 ? 1 : 2;
      priceOf.bind([track]);
      priceOf.step();
      const price = Number(priceOf.get()[0]);
      priceOf.reset();
      items.push([track, price, qty]);
      total += price * qty;
    }
    invoiceStmt.run([customer, date, Math.round(total * 100) / 100]);
    for (const [track, price, qty] of items) itemStmt.run([i, track, price, qty]);
  }
  priceOf.free();
  invoiceStmt.free();
  itemStmt.free();
  db.run('COMMIT');
}

export const SAMPLE_QUERIES: { name: string; sql: string }[] = [
  {
    name: 'Revenue by genre',
    sql: `SELECT g.name AS genre, ROUND(SUM(ii.unit_price * ii.quantity), 2) AS revenue
FROM invoice_items ii
JOIN tracks t ON t.track_id = ii.track_id
JOIN albums al ON al.album_id = t.album_id
JOIN genres g ON g.genre_id = al.genre_id
GROUP BY g.name
ORDER BY revenue DESC;`,
  },
  {
    name: 'Top customers',
    sql: `SELECT c.first_name || ' ' || c.last_name AS customer, c.country,
       COUNT(i.invoice_id) AS invoices, ROUND(SUM(i.total), 2) AS spent
FROM customers c
JOIN invoices i ON i.customer_id = c.customer_id
GROUP BY c.customer_id
ORDER BY spent DESC
LIMIT 10;`,
  },
  {
    name: 'Monthly sales',
    sql: `SELECT substr(invoice_date, 1, 7) AS month, ROUND(SUM(total), 2) AS revenue, COUNT(*) AS invoices
FROM invoices
GROUP BY month
ORDER BY month;`,
  },
  {
    name: 'Longest tracks',
    sql: `SELECT t.name AS track, ar.name AS artist, al.title AS album,
       ROUND(t.duration_ms / 60000.0, 2) AS minutes
FROM tracks t
JOIN albums al ON al.album_id = t.album_id
JOIN artists ar ON ar.artist_id = al.artist_id
ORDER BY t.duration_ms DESC
LIMIT 15;`,
  },
];
