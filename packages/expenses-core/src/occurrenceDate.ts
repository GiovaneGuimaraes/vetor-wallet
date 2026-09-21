import { daysInMonth } from './daysInMonth';

/**
 * A data `YYYY-MM-DD` da ocorrência de um mês, com o dia **preso** ao mês.
 *
 * Dia 31 numa recorrência que cai em abril vira 30, e 29/30 em fevereiro viram
 * o último dia real — a alternativa (deixar o `Date` normalizar) jogaria a
 * ocorrência para o mês seguinte, onde ela não pertence e não seria encontrada
 * pela listagem daquele mês. O piso em 1 cobre input degenerado.
 */
export function occurrenceDate(monthKey: string, dayOfMonth: number): string {
  const total = daysInMonth(monthKey);
  if (total === 0) return '';
  const day = Math.min(Math.max(Math.trunc(dayOfMonth), 1), total);
  return `${monthKey}-${String(day).padStart(2, '0')}`;
}
