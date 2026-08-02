import { describe, expect, it } from 'vitest';
import { wouldOverdrawBalance } from './savingsWithdraw';

describe('wouldOverdrawBalance', () => {
  it('não avisa quando o saque é menor que o saldo', () => {
    expect(wouldOverdrawBalance(100, 5042)).toBe(false);
  });

  it('não avisa quando o saque é exatamente igual ao saldo', () => {
    expect(wouldOverdrawBalance(5042, 5042)).toBe(false);
  });

  it('avisa quando o saque é maior que o saldo', () => {
    expect(wouldOverdrawBalance(99999, 5042)).toBe(true);
  });

  it('compara em centavos inteiros, sem ruído de float', () => {
    // 0.1 + 0.2 !== 0.3 em float puro; a comparação em centavos evita o falso positivo.
    expect(wouldOverdrawBalance(0.3, 0.1 + 0.2)).toBe(false);
  });

  it('avisa por um centavo de diferença', () => {
    expect(wouldOverdrawBalance(10.01, 10)).toBe(true);
  });

  it('lida com saldo negativo (bases legadas) sempre avisando para saque positivo', () => {
    expect(wouldOverdrawBalance(1, -5)).toBe(true);
  });
});
