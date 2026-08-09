import { MAX_MONEY_AMOUNT } from './MAX_MONEY_AMOUNT';

/** Mensagem de erro para valor acima do limite máximo aceito (T-065). */
export function moneyRangeError(field: string = 'amount'): string {
  return `${field} excede o limite máximo permitido (${MAX_MONEY_AMOUNT.toLocaleString('pt-BR')})`;
}
