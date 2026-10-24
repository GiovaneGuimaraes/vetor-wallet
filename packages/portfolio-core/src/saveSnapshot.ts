import type { Query } from '@vetor-wallet/query';

export interface SaveSnapshotParams {
  query: Query;
  ticker: string;
  price: number;
}

/**
 * Inserts a snapshot with `ON CONFLICT DO NOTHING` so the UNIQUE(ticker, date)
 * constraint silently prevents duplicates if the job runs more than once on the
 * same day. Returns true if the row was inserted, false if it was a duplicate.
 *
 * Era `INSERT OR IGNORE` até a T-114: a forma `ON CONFLICT DO NOTHING` (sem
 * alvo) roda igual no SQLite ≥ 3.24 e no Postgres, e nos dois casa com o
 * índice ÚNICO de EXPRESSÃO `(ticker, date(captured_at))`. Diferença de borda
 * aceita: `OR IGNORE` também engolia violação de NOT NULL; `DO NOTHING` só a de
 * unicidade — e `ticker`/`price` nunca chegam nulos aqui.
 */
export async function saveSnapshot(params: SaveSnapshotParams): Promise<boolean> {
  const { query, ticker, price } = params;
  const result = await query({
    text: `INSERT INTO quote_snapshots (ticker, price) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    values: [ticker, price],
  });
  return result.rowCount > 0;
}
