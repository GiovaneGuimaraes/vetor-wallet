import { abacatePayRequest } from './request';

/**
 * Cancela a assinatura na AbacatePay — **IMEDIATAMENTE** (não "ao fim do
 * período"). O que o usuário já pagou é decisão da regra (T-124b1), não daqui.
 *
 * Não devolve a assinatura: a forma da resposta de sucesso não foi observada,
 * e quem precisa do estado depois do cancelamento relê por `getSubscription`.
 * Id inexistente é HTTP 400 "Subscription not found" → `AbacatePayError`.
 */
export const cancelSubscription = async (subscriptionId: string): Promise<void> => {
  await abacatePayRequest<unknown>('/subscriptions/cancel', {
    method: 'POST',
    body: { id: subscriptionId },
  });
};
