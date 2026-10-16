import type { Db } from '@vetor-wallet/db';

export interface SaveSnapshotForDateParams {
  db: Db;
  ticker: string;
  price: number;
  /** `YYYY-MM-DD`; a linha é gravada às 18:00 desse dia. */
  isoDate: string;
}

/**
 * Saves a closing price for a specific past date (historical backfill). Mesmo
 * `INSERT OR IGNORE` de `saveSnapshot`: o UNIQUE(ticker, date) descarta o
 * duplicado. Nenhum chamador em produção hoje — é a porta do backfill.
 */
export async function saveSnapshotForDate(params: SaveSnapshotForDateParams): Promise<boolean> {
  const { db, ticker, price, isoDate } = params;
  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO quote_snapshots (ticker, price, captured_at) VALUES (?, ?, ?)`,
    args: [ticker, price, `${isoDate}T18:00:00`],
  });
  return result.rowsAffected > 0;
}
