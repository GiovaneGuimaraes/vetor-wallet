import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'wallet.db');

export const db = createClient({ url: `file:${dbPath}` });

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
      captured_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(ticker, date(captured_at))
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_snapshots_ticker_time
     ON quote_snapshots(ticker, captured_at)`,
  );

  // Add user_id column to existing tables (idempotent — ignored if already present)
  for (const sql of [
    'ALTER TABLE operations ADD COLUMN user_id INTEGER REFERENCES users(id)',
    'ALTER TABLE alert_rules ADD COLUMN user_id INTEGER REFERENCES users(id)',
  ]) {
    try {
      await db.execute(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }
}
