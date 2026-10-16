import type { Db } from '@vetor-wallet/db';

export interface GetPreviousCloseSnapshotsParams {
  db: Db;
  tickers: string[];
  /** `YYYY-MM-DD` — o corte é ESTRITAMENTE anterior a esta data. */
  beforeDateISO: string;
}

/**
 * Returns, per ticker, the price of the most recent `quote_snapshots` row
 * captured strictly before `beforeDateISO` (YYYY-MM-DD). Tickers without any
 * snapshot before that date are simply absent from the returned map — callers
 * (T-016) treat that as "day P&L unavailable" for the whole portfolio.
 */
export async function getPreviousCloseSnapshots(
  params: GetPreviousCloseSnapshotsParams
): Promise<Map<string, number>> {
  const { db, tickers, beforeDateISO } = params;
  const map = new Map<string, number>();
  if (tickers.length === 0) return map;

  const placeholders = tickers.map(() => '?').join(',');
  const result = await db.execute({
    sql: `
      SELECT ticker, price FROM quote_snapshots
      WHERE ticker IN (${placeholders})
        AND date(captured_at) < ?
        AND captured_at = (
          SELECT MAX(captured_at) FROM quote_snapshots AS qs2
          WHERE qs2.ticker = quote_snapshots.ticker AND date(qs2.captured_at) < ?
        )
    `,
    args: [...tickers, beforeDateISO, beforeDateISO],
  });

  for (const row of result.rows) {
    map.set(row.ticker as string, Number(row.price));
  }
  return map;
}
