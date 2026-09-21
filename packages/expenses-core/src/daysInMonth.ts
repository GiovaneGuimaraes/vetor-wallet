/** Dias do mês de um `YYYY-MM`. Retorna 0 para input malformado. */
export function daysInMonth(monthKey: string): number {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
