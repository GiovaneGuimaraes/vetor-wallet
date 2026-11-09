import type { Query } from '@vetor-wallet/query';

import { createCustomer } from './providers/abacatepay/createCustomer';

export interface EnsureBillingCustomerResult {
  /** `cust_…` que vale para este usuário (o gravado em `billing_customers`). */
  customerId: string;
  /** true só quando ESTA chamada criou o cliente E gravou o vínculo. */
  created: boolean;
  /**
   * Cliente que esta chamada criou no provedor e PERDEU a corrida do INSERT
   * (outra chamada gravou primeiro). Fica órfão na AbacatePay — sem cobrança,
   * sem assinatura; a rota loga para limpeza manual.
   */
  orphanCustomerId?: string;
}

export const selectBillingCustomerText =
  'SELECT abacate_customer_id FROM billing_customers WHERE user_id = $1';

/**
 * O cliente da AbacatePay deste usuário, criando na primeira vez.
 *
 * **Por que guardar o id do nosso lado**: a AbacatePay só deduplica cliente
 * por CPF/CNPJ, e nós não mandamos CPF (decisão 2 do humano). Sem o vínculo
 * gravado, cada assinatura criaria um cliente novo — e o portal de um não
 * mostraria a assinatura do outro.
 *
 * Corrida (dois checkouts ao mesmo tempo): os dois criam cliente no provedor,
 * mas só um INSERT grava (`ON CONFLICT(user_id) DO NOTHING`). Quem perde decide
 * pelo `rowCount` 0 — nunca por um SELECT anterior — relê o vencedor e devolve
 * o id dele, reportando o próprio como `orphanCustomerId`.
 *
 * Falha do provedor sobe como `AbacatePayError` (nada foi gravado).
 */
export const ensureBillingCustomer = async (args: {
  query: Query;
  userId: number;
  email: string;
  name: string;
}): Promise<EnsureBillingCustomerResult> => {
  const read = async (): Promise<string | null> => {
    const res = await args.query<{ abacate_customer_id: string }>({
      text: selectBillingCustomerText,
      values: [args.userId],
    });
    const row = res.rows[0];
    return row ? String(row.abacate_customer_id) : null;
  };

  const existing = await read();
  if (existing) return { customerId: existing, created: false };

  const { id } = await createCustomer({ email: args.email, name: args.name });

  const insert = await args.query({
    text: `INSERT INTO billing_customers (user_id, abacate_customer_id) VALUES ($1, $2)
          ON CONFLICT(user_id) DO NOTHING`,
    values: [args.userId, id],
  });
  if (insert.rowCount === 1) return { customerId: id, created: true };

  const winner = await read();
  if (!winner) {
    // ON CONFLICT(user_id) só engole conflito de user_id; rowCount 0 sem linha
    // do usuário é estado impossível — falha alto em vez de inventar um id.
    throw new Error(`billing_customers sem linha para o usuário ${args.userId} após conflito`);
  }
  return { customerId: winner, created: false, orphanCustomerId: id };
};
