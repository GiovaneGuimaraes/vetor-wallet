import { describe, it, expect } from 'vitest';
import {
  ActivationPendingError,
  AlreadySubscribedError,
  CheckoutInProgressError,
  ProductArchivedError,
  ProductPriceMismatchError,
} from '@vetor-wallet/subscription-core';
import { mapBillingError } from './billingErrors';

describe('mapBillingError', () => {
  it('ActivationPendingError → 409 ACTIVATION_PENDING (antes do pai AlreadySubscribedError)', () => {
    expect(mapBillingError(new ActivationPendingError())).toMatchObject({
      status: 409,
      body: { code: 'ACTIVATION_PENDING' },
    });
  });

  it('AlreadySubscribedError → 409 ALREADY_SUBSCRIBED', () => {
    expect(mapBillingError(new AlreadySubscribedError())).toMatchObject({
      status: 409,
      body: { code: 'ALREADY_SUBSCRIBED' },
    });
  });

  it('CheckoutInProgressError → 409 CHECKOUT_IN_PROGRESS', () => {
    expect(mapBillingError(new CheckoutInProgressError())).toMatchObject({
      status: 409,
      body: { code: 'CHECKOUT_IN_PROGRESS' },
    });
  });

  it('produto arquivado ou com preço divergente → 502 BILLING_NOT_CONFIGURED', () => {
    for (const err of [
      new ProductArchivedError('prod_1', 'plan:1'),
      new ProductPriceMismatchError('prod_1', 100, 200),
    ]) {
      expect(mapBillingError(err)).toMatchObject({
        status: 502,
        body: { code: 'BILLING_NOT_CONFIGURED' },
      });
    }
  });

  it('erro desconhecido → null (a rota deixa subir)', () => {
    expect(mapBillingError(new Error('x'))).toBeNull();
    expect(mapBillingError('x')).toBeNull();
  });
});
