import { parseInstant } from './parseInstant';

/** Assinatura vale agora? `active` com período vencido NÃO vale. */
export const isSubscriptionActive = (
  sub: { status: string; current_period_end: string | null } | null | undefined,
  nowIso: string
): boolean => {
  if (!sub || sub.status !== 'active' || !sub.current_period_end) return false;
  return parseInstant(sub.current_period_end) > parseInstant(nowIso);
};
