import type { Db } from '@vetor-wallet/db';

export interface SaveSnapshotParams {
  db: Db;
  ticker: string;
  price: number;
}

/**
 * Inserts a snapshot using INSERT OR IGNORE so the UNIQUE(ticker, date) constraint
 * silently prevents duplicates if the job runs more than once on the same day.
 * Returns true if the row was inserted, false if it was a duplicate.
 */
export async function saveSnapshot(params: SaveSnapshotParams): Promise<boolean> {
  const { db, ticker, price } = params;
  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO quote_snapshots (ticker, price) VALUES (?, ?)`,
    args: [ticker, price],
  });
  return result.rowsAffected > 0;
}
