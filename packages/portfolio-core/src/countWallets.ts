import type { Db } from '@vetor-wallet/db';

export interface CountWalletsParams {
  db: Db;
  userId: number;
}

/**
 * Quantas carteiras o usuário tem. É a checagem de `POST /api/wallets`
 * (carteira única, T-050) — sempre dentro de `withUserLock` (T-065), senão dois
 * POSTs simultâneos passam os dois pela contagem zero.
 */
export async function countWallets(params: CountWalletsParams): Promise<number> {
  const { db, userId } = params;
  const result = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM wallets WHERE user_id = ?',
    args: [userId],
  });
  return Number(result.rows[0]?.n ?? 0);
}
