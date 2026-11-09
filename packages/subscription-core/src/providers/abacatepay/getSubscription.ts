import { type AbacateSubscription, toAbacateSubscription } from './AbacateSubscription';
import { abacatePayRequest } from './request';

/**
 * Lê uma assinatura (`subs_…`). Id inexistente é HTTP 400 "Subscription not
 * found" → `AbacatePayError`, e sobe: aqui, ao contrário do produto, "não
 * existe" não tem recuperação automática — quem chama tem o id gravado e
 * precisa saber que ele não bate.
 */
export const getSubscription = async (subscriptionId: string): Promise<AbacateSubscription> => {
  const raw = await abacatePayRequest<unknown>(
    `/subscriptions/get?id=${encodeURIComponent(subscriptionId)}`,
    { method: 'GET' }
  );

  return toAbacateSubscription(raw);
};
