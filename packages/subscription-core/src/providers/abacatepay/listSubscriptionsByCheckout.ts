import { type AbacateSubscription, toAbacateSubscription } from './AbacateSubscription';
import { AbacatePayError } from './AbacatePayError';
import { abacatePayRequest } from './request';

/**
 * As assinaturas nascidas de um checkout (`bill_…`). **Lista vazia é resultado
 * válido**: antes do pagamento a API responde `data: []` — o checkout existe,
 * a assinatura ainda não. Só `data` que não é lista é erro (lançado).
 */
export const listSubscriptionsByCheckout = async (
  checkoutId: string
): Promise<AbacateSubscription[]> => {
  const path = `/subscriptions/list?checkoutId=${encodeURIComponent(checkoutId)}`;
  const raw = await abacatePayRequest<unknown>(path, { method: 'GET' });

  if (!Array.isArray(raw)) {
    throw new AbacatePayError(`AbacatePay devolveu algo que não é lista em ${path}`, 200, raw);
  }

  return raw.map(toAbacateSubscription);
};
