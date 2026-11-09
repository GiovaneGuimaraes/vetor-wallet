import { isEmptySuccess } from './isEmptySuccess';
import { abacatePayRequest } from './request';

/**
 * Arquiva o produto no provedor (o endpoint chama-se `delete`, mas arquiva).
 * Só para limpeza — produto de plano em uso não se arquiva por aqui.
 *
 * Sucesso sem `data` é sucesso (`isEmptySuccess`, T-124b1) — mesmo motivo de
 * `cancelSubscription`.
 */
export const archiveProduct = async (productId: string): Promise<void> => {
  try {
    await abacatePayRequest<unknown>(`/products/delete?id=${encodeURIComponent(productId)}`, {
      method: 'POST',
    });
  } catch (err) {
    if (!isEmptySuccess(err)) throw err;
  }
};
