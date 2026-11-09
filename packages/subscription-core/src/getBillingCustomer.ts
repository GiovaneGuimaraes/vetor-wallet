import type { Query } from '@vetor-wallet/query';

/**
 * O `cust_…` da AbacatePay deste usuário (`billing_customers`), ou `null` se
 * ele nunca assinou no cartão. Só leitura: quem cria é `ensureBillingCustomer`.
 */
export const getBillingCustomer = async (args: {
  query: Query;
  userId: number;
}): Promise<string | null> => {
  const res = await args.query<{ abacate_customer_id: string }>({
    text: 'SELECT abacate_customer_id FROM billing_customers WHERE user_id = $1',
    values: [args.userId],
  });
  return res.rows[0]?.abacate_customer_id ?? null;
};
