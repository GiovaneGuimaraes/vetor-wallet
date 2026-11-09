import { AbacatePayError } from './AbacatePayError';
import { abacatePayRequest } from './request';

export interface CreateCustomerPortalInput {
  customerId: string;
  /**
   * Checkout (`bill_…`) a que o portal se refere. A API LÊ o campo (um id
   * inexistente dá "Checkout not found"); ausente é OMITIDO do JSON.
   */
  checkoutId?: string;
}

/** Abre o portal do cliente (trocar cartão, ver cobranças) e devolve a URL. */
export const createCustomerPortal = async (
  input: CreateCustomerPortalInput
): Promise<{ url: string }> => {
  const path = '/customer-portal/create';
  const raw = await abacatePayRequest<{ url?: unknown }>(path, {
    method: 'POST',
    body: { customerId: input.customerId, checkoutId: input.checkoutId },
  });

  if (typeof raw.url !== 'string' || raw.url === '') {
    throw new AbacatePayError(`AbacatePay não devolveu a URL do portal em ${path}`, 200, raw);
  }

  return { url: raw.url };
};
