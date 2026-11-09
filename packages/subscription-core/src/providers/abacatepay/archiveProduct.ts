import { abacatePayRequest } from './request';

/**
 * Arquiva o produto no provedor (o endpoint chama-se `delete`, mas arquiva).
 * Só para limpeza — produto de plano em uso não se arquiva por aqui.
 */
export const archiveProduct = async (productId: string): Promise<void> => {
  await abacatePayRequest<unknown>(`/products/delete?id=${encodeURIComponent(productId)}`, {
    method: 'POST',
  });
};
