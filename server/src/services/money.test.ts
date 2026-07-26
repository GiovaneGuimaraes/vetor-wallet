import { describe, expect, it } from 'vitest';
import { isValidMoneyAmount, moneyDecimalsError } from './money';

describe('isValidMoneyAmount', () => {
  it('aceita valores com 0, 1 ou 2 casas decimais', () => {
    expect(isValidMoneyAmount(10)).toBe(true);
    expect(isValidMoneyAmount(0.1)).toBe(true);
    expect(isValidMoneyAmount(1.23)).toBe(true);
    expect(isValidMoneyAmount(0)).toBe(true);
    expect(isValidMoneyAmount(-5.5)).toBe(true); // sinal não é responsabilidade deste helper
  });

  it('aceita valores grandes com 2 casas decimais sem cair em notação científica', () => {
    expect(isValidMoneyAmount(123456789.12)).toBe(true);
  });

  it('rejeita valores com 3 ou mais casas decimais', () => {
    expect(isValidMoneyAmount(0.125)).toBe(false);
    expect(isValidMoneyAmount(1.234)).toBe(false);
  });

  it('rejeita o caso clássico de imprecisão de ponto flutuante (1.005)', () => {
    expect(isValidMoneyAmount(1.005)).toBe(false);
  });

  it('rejeita valores não finitos', () => {
    expect(isValidMoneyAmount(NaN)).toBe(false);
    expect(isValidMoneyAmount(Infinity)).toBe(false);
    expect(isValidMoneyAmount(-Infinity)).toBe(false);
  });

  it('rejeita notação científica', () => {
    expect(isValidMoneyAmount(1e-7)).toBe(false);
    expect(isValidMoneyAmount(1e21)).toBe(false);
  });
});

describe('moneyDecimalsError', () => {
  it('usa "amount" como campo default', () => {
    expect(moneyDecimalsError()).toBe('amount deve ter no máximo 2 casas decimais');
  });

  it('aceita um nome de campo customizado', () => {
    expect(moneyDecimalsError('target_amount')).toBe(
      'target_amount deve ter no máximo 2 casas decimais',
    );
  });
});
