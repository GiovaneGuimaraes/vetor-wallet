import type { Db } from '@vetor-wallet/db';

export interface ResolveActiveTickersParams {
  db: Db;
}

/**
 * Tickers com posição líquida positiva somando TODOS os usuários — é a lista
 * que a coleta diária fotografa (`quote_snapshots` é global, sem `user_id`).
 */
export async function resolveActiveTickers(params: ResolveActiveTickersParams): Promise<string[]> {
  const { db } = params;
  const result = await db.execute(
    `SELECT ticker
     FROM operations
     GROUP BY ticker
     HAVING SUM(CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END) > 0`
  );
  return result.rows.map((r) => r.ticker as string);
}
