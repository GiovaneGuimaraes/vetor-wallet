import { isEmptySuccess } from './isEmptySuccess';
import { abacatePayRequest } from './request';

/**
 * Apaga um checkout de assinatura ainda aberto (`bill_…`) — usado quando o
 * usuário troca de plano antes de pagar (T-124b1): o checkout antigo vira
 * `SUPERSEDED` do nosso lado e some do provedor, para não ficar uma página de
 * pagamento válida que ninguém mais espera.
 *
 * Sucesso sem `data` conta como sucesso (`isEmptySuccess`). Qualquer outra
 * falha sobe como `AbacatePayError`; quem chama decide se ignora (a regra
 * ignora: o checkout já está `SUPERSEDED` localmente, e se for pago mesmo assim
 * a porta ativa com o plano DELE).
 */
export const deleteSubscriptionCheckout = async (checkoutId: string): Promise<void> => {
  try {
    await abacatePayRequest<unknown>(
      `/subscriptions/checkouts/delete?id=${encodeURIComponent(checkoutId)}`,
      { method: 'POST' }
    );
  } catch (err) {
    if (!isEmptySuccess(err)) throw err;
  }
};
