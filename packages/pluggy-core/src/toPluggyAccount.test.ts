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
      balance: 1234.56,
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
      balance: null,
    });
  });

  // T-089e: balance volta a ser trazido para o patrimônio total da Home.
  it('balance não-numérico vira null, nunca inventado', () => {
    expect(toPluggyAccount({ id: 'acc-3', balance: 'R$ 100' }).balance).toBeNull();
    expect(toPluggyAccount({ id: 'acc-4', balance: NaN }).balance).toBeNull();
  });

  it('balance negativo (fatura em aberto, conta CREDIT) é preservado como veio', () => {
    expect(toPluggyAccount({ id: 'acc-5', type: 'CREDIT', balance: -850.5 }).balance).toBe(-850.5);
  });
});
