import type { Query } from '@vetor-wallet/query';
import type { Wallet } from '@vetor-wallet/shared';

export interface FindDefaultWalletParams {
  query: Query;
  userId: number;
}

/**
 * Carteira mais antiga do usuário — a "padrão" da carteira única (T-050).
 * Desempate por `id` porque `created_at` tem resolução de segundos e duas
 * carteiras legadas podem compartilhar o mesmo instante.
 */
export async function findDefaultWallet(params: FindDefaultWalletParams): Promise<Wallet | null> {
  const { query, userId } = params;
  const result = await query<Wallet>({
    text: 'SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1',
    values: [userId],
  });
  return result.rows[0] ?? null;
}
