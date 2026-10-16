/**
 * Desloca uma data `YYYY-MM-DD` em `delta` dias (aritmética em UTC, sem
 * armadilha de fuso — mesma abordagem de `isValidIsoDate` em `@vetor-wallet/validation-core/src/isValidIsoDate.ts`).
 */
export function shiftDate(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) + delta * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}
