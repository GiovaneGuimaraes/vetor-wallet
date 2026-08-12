import { describe, it, expect } from 'vitest';
import { toPluggyTransaction } from './toPluggyTransaction';

describe('toPluggyTransaction (T-087)', () => {
  it('traduz o payload documentado da Pluggy', () => {
    expect(
      toPluggyTransaction({
        id: '5b3f8e2a-0000-4000-8000-000000000001',
        date: '2026-08-11T00:00:00.000Z',
        description: 'Supermercado Açaí',
        descriptionRaw: 'SUPERM ACAI 11/08',
        amount: -123.45,
        type: 'DEBIT',
        category: 'Supermarkets',
        currencyCode: 'BRL',
        status: 'POSTED',
        balance: 1000,
        creditCardMetadata: { installmentNumber: 1 },
      })
    ).toEqual({
      id: '5b3f8e2a-0000-4000-8000-000000000001',
      date: '2026-08-11T00:00:00.000Z',
      description: 'Supermercado Açaí',
      descriptionRaw: 'SUPERM ACAI 11/08',
      amount: -123.45,
      type: 'DEBIT',
      category: 'Supermarkets',
      currencyCode: 'BRL',
      status: 'POSTED',
    });
  });

  it('não inventa id nem valor: campo ausente/estranho vira null', () => {
    expect(toPluggyTransaction({})).toEqual({
      id: null,
      date: null,
      description: null,
      descriptionRaw: null,
      amount: null,
      type: null,
      category: null,
      currencyCode: null,
      status: null,
    });

    const weird = toPluggyTransaction({ id: 42, amount: '10.00', status: '   ' });
    expect(weird.id).toBeNull();
    expect(weird.amount).toBeNull();
    expect(weird.status).toBeNull();
  });

  it('recusa amount não finito (NaN/Infinity)', () => {
    expect(toPluggyTransaction({ amount: Number.NaN }).amount).toBeNull();
    expect(toPluggyTransaction({ amount: Number.POSITIVE_INFINITY }).amount).toBeNull();
  });

  it('preserva o zero (é o mapeamento que decide rejeitá-lo)', () => {
    expect(toPluggyTransaction({ amount: 0 }).amount).toBe(0);
  });

  it('tolera payload que não é objeto', () => {
    expect(toPluggyTransaction(null).id).toBeNull();
    expect(toPluggyTransaction('x').id).toBeNull();
  });
});
