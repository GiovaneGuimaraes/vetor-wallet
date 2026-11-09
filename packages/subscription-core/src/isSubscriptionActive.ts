import { parseInstant } from './parseInstant';

/**
 * Assinatura vale agora?
 *
 * - `active` com período no futuro vale; `active` VENCIDA não vale.
 * - `canceled` com período no futuro **vale** (T-124b1, decisão 4 do humano em
 *   `docs/multi-agent/plano-t-124.md`): cancelar é "acesso até o fim do período
 *   já pago", não corte imediato. Vencido o período, deixa de valer como
 *   qualquer outra.
 * - `pending`/`expired` nunca valem.
 *
 * O gate (`requireActiveSubscription`, no rest-api) herda esta regra sem mudar.
 * A comparação é estrita: terminar exatamente agora já não vale.
 */
export const isSubscriptionActive = (
  sub: { status: string; current_period_end: string | null } | null | undefined,
  nowIso: string
): boolean => {
  if (!sub || !sub.current_period_end) return false;
  if (sub.status !== 'active' && sub.status !== 'canceled') return false;
  return parseInstant(sub.current_period_end) > parseInstant(nowIso);
};
