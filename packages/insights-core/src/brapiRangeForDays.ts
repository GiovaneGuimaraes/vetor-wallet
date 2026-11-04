/**
 * Menor `range` da brapi que cobre `days` dias de histórico. A brapi só
 * aceita um conjunto fechado de valores; pedir menos truncaria a linha do
 * benchmark antes do início da janela.
 */
export function brapiRangeForDays(days: number): string {
  if (days <= 30) return '3mo';
  if (days <= 90) return '6mo';
  if (days <= 365) return '2y';
  return '5y';
}
