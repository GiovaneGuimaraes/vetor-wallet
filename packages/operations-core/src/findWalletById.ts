import type { Query } from '@vetor-wallet/query';
import type { Wallet } from '@vetor-wallet/shared';

export interface FindWalletByIdParams {
  query: Query;
  userId: number;
  id: string | number;
}

/**
 * Uma carteira do usuário, ou `null` quando ela não existe **ou** é de outro
 * usuário (os dois casos colapsam de propósito — ver o mesmo raciocínio em
 * `deleteOperation`).
 *
 * É o re-SELECT de `POST /api/wallets` (T-065): o `id` vem do
 * `getOrCreateDefaultWallet` do próprio request e seria seguro na prática, mas
 * o filtro por `user_id` fecha o mesmo descuido que o re-SELECT de operations
 * fecha (T-059).
 */
export async function findWalletById(params: FindWalletByIdParams): Promise<Wallet | null> {
  const { query, userId, id } = params;
  const result = await query<Wallet>({
    text: 'SELECT * FROM wallets WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return result.rows[0] ?? null;
}
