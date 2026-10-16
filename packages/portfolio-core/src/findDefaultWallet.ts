import type { Row } from '@libsql/client';
import type { Db } from '@vetor-wallet/db';

export interface FindDefaultWalletParams {
  db: Db;
  userId: number;
}

/**
 * Carteira mais antiga do usuário — a "padrão" da carteira única (T-050).
 * Desempate por `id` porque `created_at` tem resolução de segundos e duas
 * carteiras legadas podem compartilhar o mesmo instante.
 */
export async function findDefaultWallet(params: FindDefaultWalletParams): Promise<Row | null> {
  const { db, userId } = params;
  const result = await db.execute({
    sql: 'SELECT * FROM wallets WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT 1',
    args: [userId],
  });
  return result.rows[0] ?? null;
}
