import type { Query } from '@vetor-wallet/query';
import type { Wallet } from '@vetor-wallet/shared';

export interface ListWalletsParams {
  query: Query;
  userId: number;
}

/**
 * As carteiras de UM usuário, da mais antiga para a mais nova.
 *
 * A ordenação (`created_at ASC, id ASC`) é a mesma de `findDefaultWallet`
 * (`@vetor-wallet/portfolio-core`), com o mesmo desempate por `id` — o
 * `created_at` tem resolução de segundos e duas carteiras legadas podem
 * compartilhar o mesmo instante. Assim a primeira linha desta lista é sempre a
 * carteira padrão.
 *
 * Base legada com 2+ carteiras continua listando todas (T-050): a invariante
 * de carteira única é de aplicação, não de banco — nada é escondido, só não se
 * cria mais nenhuma.
 */
export async function listWallets(params: ListWalletsParams): Promise<Wallet[]> {
  const { query, userId } = params;
  const result = await query<Wallet>({
    text: 'SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at ASC, id ASC',
    values: [userId],
  });
  return result.rows;
}
