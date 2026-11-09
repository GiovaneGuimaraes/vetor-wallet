import type { Query } from '@vetor-wallet/query';

/**
 * O checkout (`bill_…`) do usuário a que o portal do cliente se refere:
 * `COMPLETED` de preferência (é o que tem assinatura), senão o mais recente que
 * já tenha id no provedor. `CREATING` (sem `bill_`) nunca serve.
 */
export const getLatestCheckout = async (args: {
  query: Query;
  userId: number;
}): Promise<{ abacate_checkout_id: string } | null> => {
  const res = await args.query<{ abacate_checkout_id: string }>({
    text: `SELECT abacate_checkout_id FROM subscription_checkouts
          WHERE user_id = $1 AND abacate_checkout_id IS NOT NULL
          ORDER BY (status = 'COMPLETED') DESC, id DESC
          LIMIT 1`,
    values: [args.userId],
  });
  return res.rows[0] ?? null;
};
