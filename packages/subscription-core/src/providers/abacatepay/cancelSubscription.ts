import { isEmptySuccess } from './isEmptySuccess';
import { abacatePayRequest } from './request';

/**
 * Cancela a assinatura na AbacatePay — **IMEDIATAMENTE** (não "ao fim do
 * período"). O que o usuário já pagou é decisão da regra (T-124b1), não daqui.
 *
 * Não devolve a assinatura: a forma da resposta de sucesso não foi observada,
 * e quem precisa do estado depois do cancelamento relê por `getSubscription`.
 * Id inexistente é HTTP 400 "Subscription not found" → `AbacatePayError`.
 *
 * **Sucesso sem `data` é sucesso** (T-124b1, nota do revisor da T-124a): o
 * `abacatePayRequest` lança quando `data == null`, e um cancelamento que
 * aconteceu de fato seria reportado como falha — quem chama tentaria de novo
 * ou registraria um reembolso que não precisa. `isEmptySuccess` só aceita 2xx
 * sem `error` e sem `success: false`; qualquer recusa continua subindo.
 * Quem precisa de PROVA (o cancelamento da assinatura duplicada) relê por
 * `getSubscription` e confere `CANCELLED`.
 */
export const cancelSubscription = async (subscriptionId: string): Promise<void> => {
  try {
    await abacatePayRequest<unknown>('/subscriptions/cancel', {
      method: 'POST',
      body: { id: subscriptionId },
    });
  } catch (err) {
    if (!isEmptySuccess(err)) throw err;
  }
};
