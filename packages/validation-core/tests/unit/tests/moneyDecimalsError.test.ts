import { moneyDecimalsError } from 'src/moneyDecimalsError';

describe('moneyDecimalsError', () => {
  it('usa "amount" como campo default', () => {
    expect(moneyDecimalsError()).toBe('amount deve ter no máximo 2 casas decimais');
  });

  it('aceita um nome de campo customizado', () => {
    expect(moneyDecimalsError('target_amount')).toBe(
      'target_amount deve ter no máximo 2 casas decimais'
    );
  });
});
