import type { Query } from '@vetor-wallet/query';

export interface OpenCheckoutRow {
  checkout_url: string;
  plan_id: number;
  created_at: string;
}

/**
 * O checkout `OPEN` do usuário (no máximo um — índice único parcial), só com o
 * que o cliente pode ver: a URL hospedada, o plano e quando nasceu. Os ids do
 * provedor ficam no banco. Sem `checkout_url` não há o que mostrar → `null`.
 */
export const getOpenCheckout = async (args: {
  query: Query;
  userId: number;
}): Promise<OpenCheckoutRow | null> => {
  const res = await args.query<OpenCheckoutRow>({
    text: `SELECT checkout_url, plan_id, created_at FROM subscription_checkouts
          WHERE user_id = $1 AND status = 'OPEN' AND checkout_url IS NOT NULL
          ORDER BY id DESC
          LIMIT 1`,
    values: [args.userId],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    checkout_url: row.checkout_url,
    plan_id: Number(row.plan_id),
    created_at: row.created_at,
  };
};
