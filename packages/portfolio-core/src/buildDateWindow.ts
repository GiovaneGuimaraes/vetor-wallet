import { shiftDate } from './shiftDate';

/**
 * Os `days` dias da janela que TERMINA em `endDateISO` (inclusive), em ordem
 * crescente. `days = 1` devolve só o próprio `endDateISO`.
 */
export function buildDateWindow(endDateISO: string, days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    dates.push(shiftDate(endDateISO, -i));
  }
  return dates;
}
