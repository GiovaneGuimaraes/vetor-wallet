import type { Query } from '@vetor-wallet/query';

export interface CompletedCheckoutRow {
  abacate_checkout_id: string;
  abacate_subscription_id: string;
  completed_at: string | null;
}

/**
 * O checkout `COMPLETED` (com `subs_`) mais recente do usuário — o candidato a
 * "pago sem assinatura" de `isActivationPending`. Só o mais recente importa:
 * um crash afeta o último pagamento; os anteriores ou já viraram assinatura ou
 * são histórico (duplicada cancelada, assinatura substituída).
 */
export const getLatestCompletedCheckout = async (args: {
  query: Query;
  userId: number;
}): Promise<CompletedCheckoutRow | null> => {
  const res = await args.query<CompletedCheckoutRow>({
    text: `SELECT abacate_checkout_id, abacate_subscription_id, completed_at
          FROM subscription_checkouts
          WHERE user_id = $1 AND status = 'COMPLETED' AND abacate_subscription_id IS NOT NULL
          ORDER BY completed_at DESC, id DESC
          LIMIT 1`,
    values: [args.userId],
  });
  return res.rows[0] ?? null;
};
