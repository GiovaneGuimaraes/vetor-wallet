import type { Query } from '@vetor-wallet/query';

export interface GetPreviousCloseSnapshotsParams {
  query: Query;
  tickers: string[];
  /** `YYYY-MM-DD` — o corte é ESTRITAMENTE anterior a esta data. */
  beforeDateISO: string;
}

/**
 * Returns, per ticker, the price of the most recent `quote_snapshots` row
 * captured strictly before `beforeDateISO` (YYYY-MM-DD). Tickers without any
 * snapshot before that date are simply absent from the returned map — callers
 * (T-016) treat that as "day P&L unavailable" for the whole portfolio.
 *
 * Placeholders numerados em sequência (`$1..$N` dos tickers, depois as duas
 * datas): o adaptador SQLite traduz por ORDEM de aparição, então nenhum número
 * se repete — a data entra duas vezes em `values`.
 */
export async function getPreviousCloseSnapshots(
  params: GetPreviousCloseSnapshotsParams
): Promise<Map<string, number>> {
  const { query, tickers, beforeDateISO } = params;
  const map = new Map<string, number>();
  if (tickers.length === 0) return map;

  const placeholders = tickers.map((_, i) => `$${i + 1}`).join(',');
  const n = tickers.length;
  const result = await query<{ ticker: string; price: number | string }>({
    text: `
      SELECT ticker, price FROM quote_snapshots
      WHERE ticker IN (${placeholders})
        AND date(captured_at) < $${n + 1}
        AND captured_at = (
          SELECT MAX(captured_at) FROM quote_snapshots AS qs2
          WHERE qs2.ticker = quote_snapshots.ticker AND date(qs2.captured_at) < $${n + 2}
        )
    `,
    values: [...tickers, beforeDateISO, beforeDateISO],
  });

  for (const row of result.rows) {
    map.set(row.ticker, Number(row.price));
  }
  return map;
}
