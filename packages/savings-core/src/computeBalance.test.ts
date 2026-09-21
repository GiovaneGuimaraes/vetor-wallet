import { describe, it, expect } from 'vitest';
import { computeBalance } from './computeBalance';

describe('computeBalance', () => {
  it('soma DEPOSIT e YIELD e subtrai WITHDRAW', () => {
    expect(
      computeBalance([
        { type: 'DEPOSIT', amount: 100 },
        { type: 'YIELD', amount: 1.5 },
        { type: 'WITHDRAW', amount: 30 },
      ])
    ).toBe(71.5);
  });

  it('lista vazia é saldo zero', () => {
    expect(computeBalance([])).toBe(0);
  });

  it('não acumula erro de ponto flutuante (invariante de centavos, T-052)', () => {
    const entries = Array.from({ length: 3 }, () => ({ type: 'DEPOSIT' as const, amount: 0.1 }));
    expect(computeBalance(entries)).toBe(0.3);
  });

  it('aceita saldo negativo quando os saques superam os aportes', () => {
    expect(
      computeBalance([
        { type: 'DEPOSIT', amount: 10 },
        { type: 'WITHDRAW', amount: 25 },
      ])
    ).toBe(-15);
  });
});
