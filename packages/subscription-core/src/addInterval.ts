import type { PlanInterval } from '@vetor-wallet/shared';

import { parseInstant } from './parseInstant';
import { toSqliteUtc } from './toSqliteUtc';

const daysInUtcMonth = (year: number, monthIndex: number): number => {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
};

/**
 * Soma um período de assinatura a um instante, em UTC, com **clamp de dia**:
 * 31/01 + 1 mês = 28/02 (não 03/03, que é o que `setUTCMonth` faria por
 * overflow), 29/02 + 1 ano = 28/02. Cobrar sempre no dia 31 quem assinou dia 31
 * é impossível; encurtar para o último dia do mês destino é a convenção usual e
 * nunca dá ao usuário menos do que ele pagou de forma perceptível.
 */
export const addInterval = (fromIso: string, interval: PlanInterval): string => {
  const from = parseInstant(fromIso);
  const year = from.getUTCFullYear() + (interval === 'yearly' ? 1 : 0);
  const monthIndex = from.getUTCMonth() + (interval === 'monthly' ? 1 : 0);

  // Normaliza dezembro + 1 mês para janeiro do ano seguinte antes do clamp.
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const day = Math.min(from.getUTCDate(), daysInUtcMonth(targetYear, targetMonth));

  return toSqliteUtc(
    new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        day,
        from.getUTCHours(),
        from.getUTCMinutes(),
        from.getUTCSeconds(),
      ),
    ),
  );
};
