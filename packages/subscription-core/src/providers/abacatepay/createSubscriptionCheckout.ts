import { AbacatePayError } from './AbacatePayError';
import { abacatePayRequest } from './request';

export interface CreateSubscriptionCheckoutInput {
  /** Id do produto recorrente no provedor (`plans.abacate_product_id`). */
  productId: string;
  /** Id do cliente no provedor (`billing_customers.abacate_customer_id`). */
  customerId: string;
  /** Nossa referência do checkout (o id local de `subscription_checkouts`). */
  externalId: string;
  /** Para onde o provedor manda depois do pagamento. `http://localhost` é aceito. */
  completionUrl: string;
  /** Para onde o "voltar" da página hospedada manda. */
  returnUrl: string;
}

/** Checkout criado: `bill_…` e a página hospedada de pagamento. */
export interface AbacateSubscriptionCheckout {
  id: string;
  url: string;
}

/**
 * Abre o checkout de assinatura no cartão. O que volta é o checkout (`bill_…`)
 * com a `url` hospedada; a assinatura (`subs_…`) só passa a existir depois do
 * pagamento, e se acha por `listSubscriptionsByCheckout`.
 */
export const createSubscriptionCheckout = async (
  input: CreateSubscriptionCheckoutInput
): Promise<AbacateSubscriptionCheckout> => {
  const path = '/subscriptions/create';
  const raw = await abacatePayRequest<{ id?: unknown; url?: unknown }>(path, {
    method: 'POST',
    body: {
      items: [{ id: input.productId, quantity: 1 }],
      customerId: input.customerId,
      externalId: input.externalId,
      methods: ['CARD'],
      completionUrl: input.completionUrl,
      returnUrl: input.returnUrl,
    },
  });

  // Sem id ou sem url o usuário não tem para onde ir nem nós o que reconciliar.
  if (
    typeof raw.id !== 'string' ||
    raw.id === '' ||
    typeof raw.url !== 'string' ||
    raw.url === ''
  ) {
    throw new AbacatePayError(`AbacatePay devolveu checkout incompleto em ${path}`, 200, raw);
  }

  return { id: raw.id, url: raw.url };
};
