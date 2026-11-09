import { parseInstant } from './parseInstant';

/**
 * Checkout PAGO cuja assinatura não chegou a `subscriptions` (achado do
 * revisor da T-124b1): o UPDATE do checkout para `COMPLETED` aconteceu, mas o
 * UPSERT da assinatura não — processo morreu entre as duas escritas, ou o
 * UPSERT otimista perdeu `MAX_ACTIVATION_ATTEMPTS` corridas. Sem isto o
 * usuário pagou, ficou sem acesso, a reentrega respondia `already_applied`, a
 * reconciliação não olhava e o `startCardCheckout` deixava pagar de novo.
 *
 * Pendente quando, para o checkout `COMPLETED` mais recente do usuário:
 * - ele tem `subs_` e `completed_at`;
 * - a linha de `subscriptions` existe e está `pending` — o estado em que o
 *   `startCardCheckout` a deixa antes do pagamento (a linha SEMPRE existe:
 *   ela nasce antes da chamada ao provedor);
 * - a linha não tem esse `subs_`;
 * - o checkout foi concluído DEPOIS da última escrita na linha
 *   (`completed_at >= updated_at`).
 *
 * A última condição é o que separa o crash de histórico velho: uma duplicada
 * antiga (checkout `COMPLETED` com um `subs_` que nunca foi para a linha, de
 * propósito) ou uma assinatura antiga substituída têm `completed_at` ANTERIOR
 * ao `pending` gravado pelo checkout seguinte — e não podem ressuscitar.
 */
export const isActivationPending = (
  checkout:
    { abacate_subscription_id: string | null; completed_at: string | null } | null | undefined,
  sub:
    | { status: string; abacate_subscription_id: string | null; updated_at: string | null }
    | null
    | undefined
): boolean => {
  if (!checkout || !checkout.abacate_subscription_id || !checkout.completed_at) return false;
  if (!sub || sub.status !== 'pending') return false;
  if (sub.abacate_subscription_id === checkout.abacate_subscription_id) return false;
  if (!sub.updated_at) return true;
  return parseInstant(checkout.completed_at) >= parseInstant(sub.updated_at);
};
