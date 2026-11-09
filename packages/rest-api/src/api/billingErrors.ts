import {
  ActivationPendingError,
  AlreadySubscribedError,
  CheckoutInProgressError,
  ProductArchivedError,
  ProductPriceMismatchError,
} from '@vetor-wallet/subscription-core';

export interface BillingHttpError {
  status: number;
  body: { code: string; error: string };
}

/**
 * Tradução dos erros tipados da regra de assinatura (`subscription-core`) em
 * HTTP. Pronta para o `POST /api/subscriptions` de cartão (T-124c); o `/sync` e
 * o `/portal` quase não encontram esses erros. `null` = não é erro de billing
 * conhecido: a rota deixa subir para o `errorHandler`.
 *
 * `ActivationPendingError` é FILHO de `AlreadySubscribedError`: precisa ser
 * testado antes, senão viraria 409 ALREADY_SUBSCRIBED e o web não saberia que
 * o caminho é "confirmando", não "já assinou".
 */
export function mapBillingError(err: unknown): BillingHttpError | null {
  if (err instanceof ActivationPendingError) {
    return {
      status: 409,
      body: { code: 'ACTIVATION_PENDING', error: 'Pagamento recebido, confirmando a assinatura' },
    };
  }
  if (err instanceof AlreadySubscribedError) {
    return {
      status: 409,
      body: { code: 'ALREADY_SUBSCRIBED', error: 'Já existe uma assinatura ativa' },
    };
  }
  if (err instanceof CheckoutInProgressError) {
    return {
      status: 409,
      body: { code: 'CHECKOUT_IN_PROGRESS', error: 'Já existe um checkout em andamento' },
    };
  }
  if (err instanceof ProductPriceMismatchError || err instanceof ProductArchivedError) {
    return {
      status: 502,
      body: { code: 'BILLING_NOT_CONFIGURED', error: 'Pagamento não está configurado' },
    };
  }
  return null;
}
