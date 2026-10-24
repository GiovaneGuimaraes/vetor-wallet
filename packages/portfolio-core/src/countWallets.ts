import type { Query } from '@vetor-wallet/query';

export interface CountWalletsParams {
  query: Query;
  userId: number;
}

/**
 * Quantas carteiras o usuário tem. É a checagem de `POST /api/wallets`
 * (carteira única, T-050) — sempre dentro de `withUserLock` (T-065), senão dois
 * POSTs simultâneos passam os dois pela contagem zero.
 */
export async function countWallets(params: CountWalletsParams): Promise<number> {
  const { query, userId } = params;
  const result = await query<{ n: number | string }>({
    text: 'SELECT COUNT(*) AS n FROM wallets WHERE user_id = $1',
    values: [userId],
  });
  return Number(result.rows[0]?.n ?? 0);
}
