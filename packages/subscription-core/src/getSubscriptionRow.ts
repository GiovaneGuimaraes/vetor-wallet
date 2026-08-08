import type { Db } from '@vetor-wallet/db';

import type { SubscriptionRow } from './Subscription';

export const getSubscriptionRowText = 'SELECT * FROM subscriptions WHERE user_id = ?';

/** Assinatura do usuário (há no máximo uma — `user_id` é UNIQUE). */
export const getSubscriptionRow = async (args: {
  db: Db;
  userId: number;
}): Promise<SubscriptionRow | null> => {
  const res = await args.db.execute({ sql: getSubscriptionRowText, args: [args.userId] });
  return (res.rows[0] as unknown as SubscriptionRow) ?? null;
};
