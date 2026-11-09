import { toAbacateSubscription } from 'src/providers/abacatepay/AbacateSubscription';

const full = {
  id: 'subs_abc',
  checkoutId: 'bill_abc',
  customerId: 'cust_abc',
  amount: 2990,
  status: 'ACTIVE',
  method: 'CARD',
  trialDays: 0,
  trialEndsAt: '2026-11-15T00:00:00.000Z',
  retryPolicy: { maxRetry: 3, retryEvery: 1 },
  cancelledDueTo: 'MAX_RETRIES',
  nextBillingAt: '2026-12-08T12:00:00.000Z',
  createdAt: '2026-11-08T12:00:00.000Z',
  updatedAt: '2026-11-08T12:05:00.000Z',
};

const allNull = {
  id: null,
  checkoutId: null,
  customerId: null,
  amount: null,
  status: 'UNKNOWN',
  providerStatus: null,
  method: null,
  trialDays: null,
  trialEndsAt: null,
  retryPolicy: null,
  cancelledDueTo: null,
  nextBillingAt: null,
  createdAt: null,
  updatedAt: null,
};

describe('toAbacateSubscription', () => {
  test('normaliza a assinatura completa', () => {
    expect(toAbacateSubscription({ ...full, unknownField: 1 })).toEqual({
      ...full,
      status: 'ACTIVE',
      providerStatus: 'ACTIVE',
    });
  });

  describe('status', () => {
    test.each([
      ['ACTIVE', 'ACTIVE'],
      ['active', 'ACTIVE'],
      ['CANCELLED', 'CANCELLED'],
      ['CANCELED', 'CANCELLED'],
      ['PENDING', 'PENDING'],
      ['FAILED', 'FAILED'],
      ['EXPIRED', 'UNKNOWN'],
      ['constructor', 'UNKNOWN'],
      ['', 'UNKNOWN'],
    ])('%j → %s', (raw, expected) => {
      expect(toAbacateSubscription({ status: raw }).status).toBe(expected);
    });

    test('status cru é preservado em providerStatus, mesmo desconhecido', () => {
      expect(toAbacateSubscription({ status: 'PAUSED' })).toMatchObject({
        status: 'UNKNOWN',
        providerStatus: 'PAUSED',
      });
    });

    test('status que não é string → UNKNOWN e providerStatus null', () => {
      expect(toAbacateSubscription({ status: 1 })).toMatchObject({
        status: 'UNKNOWN',
        providerStatus: null,
      });
    });
  });

  describe('nunca lança por campo faltando', () => {
    test.each([[{}], [null], [undefined], ['subs_abc'], [42], [[full]]])('%j', (raw) => {
      expect(toAbacateSubscription(raw)).toEqual(allNull);
    });

    test('campos de tipo errado viram null', () => {
      expect(
        toAbacateSubscription({
          id: 1,
          amount: '2990',
          trialDays: Number.POSITIVE_INFINITY,
          retryPolicy: [1, 2],
          createdAt: 'ontem',
          updatedAt: 1731067200000,
        })
      ).toEqual(allNull);
    });

    test('retryPolicy null fica null', () => {
      expect(toAbacateSubscription({ retryPolicy: null }).retryPolicy).toBeNull();
    });
  });

  describe('próxima cobrança: nome não documentado, lido defensivamente', () => {
    test('usa nextBillingAt quando válido', () => {
      expect(
        toAbacateSubscription({
          nextBillingAt: '2026-12-01T00:00:00Z',
          nextChargeAt: '2026-12-02T00:00:00Z',
          currentPeriodEnd: '2026-12-03T00:00:00Z',
        }).nextBillingAt
      ).toBe('2026-12-01T00:00:00Z');
    });

    test('cai para nextChargeAt se nextBillingAt for inválido', () => {
      expect(
        toAbacateSubscription({
          nextBillingAt: 'lixo',
          nextChargeAt: '2026-12-02T00:00:00Z',
          currentPeriodEnd: '2026-12-03T00:00:00Z',
        }).nextBillingAt
      ).toBe('2026-12-02T00:00:00Z');
    });

    test('cai para currentPeriodEnd por último', () => {
      expect(
        toAbacateSubscription({ currentPeriodEnd: '2026-12-03T00:00:00Z' }).nextBillingAt
      ).toBe('2026-12-03T00:00:00Z');
    });

    test('nenhum válido → null', () => {
      expect(
        toAbacateSubscription({ nextBillingAt: '', nextChargeAt: 5, currentPeriodEnd: 'x' })
          .nextBillingAt
      ).toBeNull();
    });
  });
});
