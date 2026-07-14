import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';

// DATABASE_URL overrides the default local SQLite path.
// Use it when running from a different cwd (e.g. the cli package) or when
// migrating to Turso: DATABASE_URL=libsql://your-db.turso.io?authToken=...
const dbUrl = process.env.DATABASE_URL ?? (() => {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return `file:${path.join(dataDir, 'wallet.db')}`;
})();

export const db = createClient({ url: dbUrl });

export async function initDb() {
  await db.batch(
    [
      {
        sql: `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS operations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticker TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL')),
          quantity REAL NOT NULL,
          price REAL NOT NULL,
          date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS alert_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticker TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('PRICE_ABOVE','PRICE_BELOW','CHANGE_PCT','ALLOCATION_PCT')),
          threshold REAL NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        args: [],
      },
    ],
    'write',
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS quote_snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker      TEXT    NOT NULL,
      price       REAL    NOT NULL,
      captured_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Expression-based unique constraints must be separate indexes in SQLite
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_unique_day
     ON quote_snapshots(ticker, date(captured_at))`,
  );

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_snapshots_ticker_time
     ON quote_snapshots(ticker, captured_at)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS hourly_quote_insights (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker      TEXT    NOT NULL,
      quote_date  TEXT    NOT NULL,
      hour        INTEGER NOT NULL CHECK(hour BETWEEN 0 AND 23),
      price       REAL    NOT NULL,
      captured_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_hourly_insights_unique
     ON hourly_quote_insights(ticker, quote_date, hour)`,
  );

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_hourly_insights_ticker_date
     ON hourly_quote_insights(ticker, quote_date)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS wallets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      color       TEXT    NOT NULL DEFAULT '#e3d5b8',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Add user_id column to existing tables (idempotent — ignored if already present)
  for (const sql of [
    'ALTER TABLE operations ADD COLUMN user_id INTEGER REFERENCES users(id)',
    'ALTER TABLE alert_rules ADD COLUMN user_id INTEGER REFERENCES users(id)',
    'ALTER TABLE operations ADD COLUMN wallet_id INTEGER REFERENCES wallets(id)',
  ]) {
    try {
      await db.execute(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }
}
