import { MAX_MONEY_AMOUNT } from './MAX_MONEY_AMOUNT';
import { moneyDecimalsError } from './moneyDecimalsError';
import { moneyRangeError } from './moneyRangeError';

/**
 * Mensagem de erro apropriada para um `value` que falhou `isValidMoneyAmount`
 * — decide entre "casas decimais" e "limite máximo" olhando o próprio motivo,
 * em vez do chamador precisar saber qual dos dois falhou.
 */
export function moneyAmountError(value: number, field: string = 'amount'): string {
  if (Math.abs(value) > MAX_MONEY_AMOUNT) return moneyRangeError(field);
  return moneyDecimalsError(field);
}
