import { describe, it, expect } from 'vitest';
import { toPluggyInvestment } from './toPluggyInvestment';

// Fixture sintética (valores redondos, nomes genéricos).
describe('toPluggyInvestment (T-091d, fatia d1)', () => {
  it('traduz um investimento completo e descarta o que o app não usa', () => {
    expect(
      toPluggyInvestment({
        id: 'inv-1',
        itemId: 'item-1',
        type: 'FIXED_INCOME',
        subtype: 'CDB',
        status: 'ACTIVE',
        name: 'CDB Exemplo',
        code: 'CDB-EX',
        currencyCode: 'BRL',
        balance: 1100,
        amount: 1100,
        amountOriginal: 1000,
        quantity: 1,
        value: 1100,
        rateType: 'CDI',
        rate: 100,
        fixedAnnualRate: 0,
        date: '2026-01-31T00:00:00.000Z',
        issueDate: '2025-01-31T00:00:00.000Z',
        dueDate: '2028-01-31T00:00:00.000Z',
        owner: 'Fulano',
        issuer: 'Banco Exemplo',
        institution: { name: 'X', number: '000' },
        transactions: [],
      })
    ).toEqual({
      id: 'inv-1',
      itemId: 'item-1',
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      status: 'ACTIVE',
      name: 'CDB Exemplo',
      code: 'CDB-EX',
      currencyCode: 'BRL',
      balance: 1100,
      amount: 1100,
      amountOriginal: 1000,
      quantity: 1,
      value: 1100,
      rateType: 'CDI',
      rate: 100,
      fixedAnnualRate: 0,
      date: '2026-01-31T00:00:00.000Z',
      issueDate: '2025-01-31T00:00:00.000Z',
      dueDate: '2028-01-31T00:00:00.000Z',
    });
  });

  it('preserva type desconhecido como veio (sem mapear)', () => {
    expect(toPluggyInvestment({ type: 'ALGO_NOVO' }).type).toBe('ALGO_NOVO');
  });

  it('campo ausente vira null — nada é inventado', () => {
    const inv = toPluggyInvestment({});
    expect(Object.values(inv).every((v) => v === null)).toBe(true);
    expect(Object.keys(inv)).toHaveLength(19);
  });

  it('tipo errado, string vazia e número não-finito viram null', () => {
    const inv = toPluggyInvestment({
      id: 42,
      type: '   ',
      balance: '1000',
      amount: NaN,
      quantity: Infinity,
      date: 20260131,
    });
    expect(inv).toMatchObject({
      id: null,
      type: null,
      balance: null,
      amount: null,
      quantity: null,
      date: null,
    });
  });

  it('payload que não é objeto vira tudo null', () => {
    expect(toPluggyInvestment(null).id).toBeNull();
    expect(toPluggyInvestment('x').type).toBeNull();
  });
});
