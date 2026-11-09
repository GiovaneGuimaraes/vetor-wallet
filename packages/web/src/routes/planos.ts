import type {
  MySubscriptionResponse,
  Plan,
  PlanInterval,
  Subscription,
} from '@vetor-wallet/shared';

/**
 * Página `/planos` (T-072; cartão recorrente desde a T-124c): funções puras da
 * vitrine de planos e do estado da assinatura. Componentes só renderizam — toda
 * a lógica testável vive aqui, ao lado de `planos.test.ts`. As regras do backend
 * que estas funções espelham estão em `packages/subscription-core/CLAUDE.md`.
 */

const fmtCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Dinheiro deste domínio vem em CENTAVOS — formatar é papel da UI. */
export function formatPlanPrice(priceCents: number): string {
  return fmtCurrency.format(priceCents / 100);
}

export function planPeriodLabel(interval: PlanInterval): string {
  return interval === 'yearly' ? '/ano' : '/mês';
}

/** Preço mensal equivalente de um plano anual (arredondado ao centavo), para comparação. */
export function monthlyEquivalentCents(plan: Plan): number {
  if (plan.interval === 'yearly') return Math.round(plan.price_cents / 12);
  return plan.price_cents;
}

/**
 * % de economia do plano anual comparado a pagar o mensal os 12 meses do ano
 * (arredondado ao inteiro mais próximo). `null` quando não há como comparar
 * (falta o mensal, preço mensal zerado, ou o próprio plano não é anual).
 */
export function yearlySavingsPercent(
  yearlyPlan: Plan,
  monthlyPlan: Plan | undefined
): number | null {
  if (yearlyPlan.interval !== 'yearly' || !monthlyPlan || monthlyPlan.price_cents <= 0) return null;
  const fullYearCents = monthlyPlan.price_cents * 12;
  if (fullYearCents <= 0) return null;
  const savings = 1 - yearlyPlan.price_cents / fullYearCents;
  return Math.round(savings * 100);
}

/**
 * Datas de billing chegam no formato SQLite UTC ('YYYY-MM-DD HH:MM:SS', sem
 * 'T'/'Z'): sem tratamento, o `Date` nativo interpretaria essa string como HORA
 * LOCAL, não UTC. Strings que já vierem com 'T' (ISO) passam direto.
 */
function parseInstantMs(value: string): number {
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(iso).getTime();
}

const POLL_DELAYS_MS = [3000, 3000, 5000, 8000];
const POLL_DELAY_CAP_MS = 15000;

/** Backoff 3s→3s→5s→8s, teto 15s. `attempt` é 0-based (tentativa que já passou). */
export function nextPollDelayMs(attempt: number): number {
  if (attempt < 0) return POLL_DELAYS_MS[0];
  if (attempt < POLL_DELAYS_MS.length) return POLL_DELAYS_MS[attempt];
  return POLL_DELAY_CAP_MS;
}

/** Quanto tempo a tela insiste no `sync` depois de voltar do checkout pago. */
export const CONFIRM_WINDOW_MS = 2 * 60 * 1000;

export type CheckoutReturn = 'completed' | 'returned' | null;

/**
 * `?checkout=` com que a AbacatePay devolve o usuário (`completionUrl` =
 * `completed`, `returnUrl` = `returned` — montadas pelo servidor). Qualquer
 * outro valor é ignorado.
 */
export function checkoutReturnParam(search: string): CheckoutReturn {
  const value = new URLSearchParams(search).get('checkout');
  return value === 'completed' || value === 'returned' ? value : null;
}

/**
 * Tem acesso agora? ESPELHA `isSubscriptionActive` do `subscription-core` (o
 * gate do servidor): `active` ou `canceled` com período no FUTURO. Sem fim de
 * período, não vale. Gate e tela precisam concordar — a T-124c corrigiu a
 * `canceled` que a UI tratava como "sem assinatura" enquanto o gate liberava.
 */
export function hasPaidAccess(sub: Subscription | null | undefined, nowMs: number): boolean {
  if (!sub || !sub.current_period_end) return false;
  if (sub.status !== 'active' && sub.status !== 'canceled') return false;
  return parseInstantMs(sub.current_period_end) > nowMs;
}

/** Pix legado: `provider` nulo (linhas de antes da T-124) ou `pix_legacy`. */
export function isLegacyPix(sub: Subscription): boolean {
  return sub.provider == null || sub.provider === 'pix_legacy';
}

export type SubscriptionUiState =
  | 'none'
  | 'pending_checkout'
  | 'confirming'
  | 'active'
  | 'canceled_with_access'
  | 'payment_failed'
  | 'expired'
  | 'legacy_pix'
  | 'staging';

type UiStateInput = Pick<
  MySubscriptionResponse,
  'billingEnabled' | 'subscription' | 'pendingCheckout' | 'confirming'
>;

/**
 * O que a tela de planos mostra, por ordem de precedência:
 *
 * 1. `staging` — billing desligado (`BILLING_ENABLED` falso: o gate não
 *    cobra) E nada de assinatura para mostrar. Com billing desligado mas
 *    assinatura/checkout existentes, o estado real vale (o banner de staging é
 *    da página, à parte) — é assim que se testa o cartão em staging sem a tela
 *    ficar presa em "staging" depois de pagar.
 * 2. `confirming` — pago, assinatura ainda não gravada (o `sync` resolve).
 * 3. Com acesso pago (`hasPaidAccess`): `canceled_with_access` (acesso até o
 *    fim do período, não renova), `legacy_pix` (Pix de antes da T-124, não
 *    renova; só assina no cartão depois de vencer), `payment_failed` (cartão
 *    recusado, acesso até o fim do período) ou `active`.
 * 4. `pending_checkout` — checkout aberto: "Continuar pagamento".
 * 5. `expired` — teve período e venceu (pode assinar de novo).
 * 6. `none`.
 */
export function subscriptionUiState(me: UiStateInput, nowMs: number): SubscriptionUiState {
  const sub = me.subscription;
  if (!me.billingEnabled && !sub && !me.pendingCheckout && !me.confirming) return 'staging';
  if (me.confirming) return 'confirming';
  if (sub && hasPaidAccess(sub, nowMs)) {
    if (sub.status === 'canceled') return 'canceled_with_access';
    if (isLegacyPix(sub)) return 'legacy_pix';
    if (sub.provider_status === 'PAYMENT_FAILED') return 'payment_failed';
    return 'active';
  }
  if (me.pendingCheckout) return 'pending_checkout';
  if (sub && (sub.status === 'expired' || sub.current_period_end != null)) return 'expired';
  return 'none';
}

/**
 * Estados em que a vitrine oferece "Assinar". Quem tem acesso pago (inclusive
 * Pix legado e cancelada no período) só assina depois de vencer — o servidor
 * responderia 409 `ALREADY_SUBSCRIBED`.
 */
export function canSubscribe(state: SubscriptionUiState): boolean {
  return (
    state === 'none' || state === 'expired' || state === 'pending_checkout' || state === 'staging'
  );
}

export type PlanBadge = 'none' | 'active' | 'expired' | 'pending' | 'canceled';

/**
 * Selo/rótulo da assinatura (usado na `/conta`). `canceled` com período pago é
 * `canceled` (acesso até o fim), não `none` — mesmo critério do gate
 * (`hasPaidAccess`); `active`/`canceled` vencidas são `expired`. Staging não
 * entra aqui: o banner de staging é da página (antes da T-124c, staging
 * escondia o estado real).
 */
export function planBadge(s: Subscription | null, nowMs: number): PlanBadge {
  if (!s) return 'none';
  if (s.status === 'pending') return 'pending';
  if (hasPaidAccess(s, nowMs)) return s.status === 'canceled' ? 'canceled' : 'active';
  return 'expired';
}

/** Forma de pagamento da assinatura, para rótulo (`/conta`). */
export function subscriptionProviderLabel(s: Subscription): string {
  return isLegacyPix(s) ? 'Pix (não renova)' : 'Cartão de crédito (renovação automática)';
}

/** Mensagem de erro do `POST /api/subscriptions`, por código. */
export function subscribeErrorMessage(code: string | undefined, fallback?: string): string {
  switch (code) {
    case 'ALREADY_SUBSCRIBED':
      return 'Você já tem uma assinatura ativa.';
    case 'CHECKOUT_IN_PROGRESS':
      return 'Já existe um pagamento sendo iniciado. Aguarde alguns segundos e tente de novo.';
    case 'ACTIVATION_PENDING':
      return 'Pagamento recebido — confirmando a sua assinatura.';
    case 'BILLING_NOT_CONFIGURED':
      return 'Pagamento ainda não está configurado neste ambiente.';
    case 'PAYMENT_PROVIDER_ERROR':
      return 'O provedor de pagamento está indisponível no momento. Tente novamente em instantes.';
    default:
      return fallback ?? 'Falha ao assinar o plano';
  }
}
