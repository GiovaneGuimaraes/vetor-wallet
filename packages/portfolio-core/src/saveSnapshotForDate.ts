import type { Query } from '@vetor-wallet/query';

export interface SaveSnapshotForDateParams {
  query: Query;
  ticker: string;
  price: number;
  /** `YYYY-MM-DD`; a linha é gravada às 18:00 desse dia. */
  isoDate: string;
}

/**
 * Saves a closing price for a specific past date (historical backfill). Mesmo
 * `ON CONFLICT DO NOTHING` de `saveSnapshot` (era `INSERT OR IGNORE` até a
 * T-114): o UNIQUE(ticker, date) descarta o duplicado. Nenhum chamador em
 * produção hoje — é a porta do backfill.
 */
export async function saveSnapshotForDate(params: SaveSnapshotForDateParams): Promise<boolean> {
  const { query, ticker, price, isoDate } = params;
  const result = await query({
    text: `INSERT INTO quote_snapshots (ticker, price, captured_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    values: [ticker, price, `${isoDate}T18:00:00`],
  });
  return result.rowCount > 0;
}
