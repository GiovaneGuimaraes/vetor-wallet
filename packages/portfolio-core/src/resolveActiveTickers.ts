import type { Query } from '@vetor-wallet/query';

export interface ResolveActiveTickersParams {
  query: Query;
}

/**
 * Tickers com posição líquida positiva somando TODOS os usuários — é a lista
 * que a coleta diária fotografa (`quote_snapshots` é global, sem `user_id`).
 */
export async function resolveActiveTickers(params: ResolveActiveTickersParams): Promise<string[]> {
  const { query } = params;
  const result = await query<{ ticker: string }>(
    `SELECT ticker
     FROM operations
     GROUP BY ticker
     HAVING SUM(CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END) > 0`
  );
  return result.rows.map((r) => r.ticker);
}
