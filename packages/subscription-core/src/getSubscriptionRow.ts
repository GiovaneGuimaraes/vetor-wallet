import type { Query } from '@vetor-wallet/query';

import type { SubscriptionRow } from './Subscription';

export const getSubscriptionRowText = 'SELECT * FROM subscriptions WHERE user_id = $1';

/**
 * Assinatura do usuário (há no máximo uma — `user_id` é UNIQUE).
 *
 * `query` no lugar de `db` (T-114, passo 5 de
 * `docs/multi-agent/plano-migracao-aws.md`).
 */
export const getSubscriptionRow = async (args: {
  query: Query;
  userId: number;
}): Promise<SubscriptionRow | null> => {
  const res = await args.query<SubscriptionRow>({
    text: getSubscriptionRowText,
    values: [args.userId],
  });
  return res.rows[0] ?? null;
};
