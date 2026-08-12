import { describe, it, expect } from 'vitest';
import { toPluggyAccount } from './toPluggyAccount';

describe('toPluggyAccount (T-087)', () => {
  it('traduz uma conta BANK', () => {
    expect(
      toPluggyAccount({
        id: 'acc-1',
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        name: 'Conta Corrente',
        marketingName: 'Conta do Banco X',
        currencyCode: 'BRL',
        balance: 1234.56,
      })
    ).toEqual({
      id: 'acc-1',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      name: 'Conta Corrente',
      currencyCode: 'BRL',
    });
  });

  it('usa marketingName quando name não vem', () => {
    expect(toPluggyAccount({ id: 'acc-2', marketingName: 'Cartão Platinum' }).name).toBe(
      'Cartão Platinum'
    );
  });

  it('campo ausente vira null', () => {
    expect(toPluggyAccount({})).toEqual({
      id: null,
      type: null,
      subtype: null,
      name: null,
      currencyCode: null,
    });
  });
});
