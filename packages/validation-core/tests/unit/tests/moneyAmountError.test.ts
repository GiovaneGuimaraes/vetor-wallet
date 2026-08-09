import { moneyAmountError } from 'src/moneyAmountError';
import { moneyDecimalsError } from 'src/moneyDecimalsError';
import { moneyRangeError } from 'src/moneyRangeError';
import { MAX_MONEY_AMOUNT } from 'src/MAX_MONEY_AMOUNT';

describe('moneyAmountError', () => {
  it('devolve o erro de casas decimais quando o valor está dentro do limite', () => {
    expect(moneyAmountError(1.234, 'amount')).toBe(moneyDecimalsError('amount'));
  });

  it('devolve o erro de limite quando o valor excede MAX_MONEY_AMOUNT', () => {
    expect(moneyAmountError(MAX_MONEY_AMOUNT + 1, 'amount')).toBe(moneyRangeError('amount'));
  });

  it('usa "amount" como campo default quando não informado', () => {
    expect(moneyAmountError(1.234)).toBe(moneyDecimalsError());
  });
});
