import { parseInstant } from './parseInstant';

/**
 * Base de contagem do novo período: o **maior** entre agora e o fim do período
 * vigente. Renovar antes de vencer soma ao que resta (o usuário não perde dias);
 * renovar depois de vencer conta a partir de agora (não presenteia o período em
 * que ficou sem pagar).
 */
export const renewalBase = (
  nowIso: string,
  currentPeriodEnd: string | null | undefined,
): string => {
  if (!currentPeriodEnd) return nowIso;
  return parseInstant(currentPeriodEnd) > parseInstant(nowIso) ? currentPeriodEnd : nowIso;
};
