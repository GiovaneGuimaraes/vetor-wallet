import type { Plan, PlanInterval, PixCharge, Subscription } from '@vetor-wallet/shared';

/**
 * Página `/planos` (T-072): funções puras da vitrine de planos e do painel
 * Pix. Componentes só renderizam — toda a lógica testável vive aqui, ao lado
 * de `planos.test.ts`. Ver `docs/decisions/billing.md` para as regras do
 * backend que essas funções espelham no cliente.
 */

const fmtCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Dinheiro deste domínio vem em CENTAVOS (ver billing.md) — formatar é papel da UI. */
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

const PNG_DATA_URI_PREFIX = 'data:image/png;base64,';

/** Aceita o base64 puro ou já prefixado com o data URI — a AbacatePay não garante qual dos dois manda. */
export function qrCodeDataUrl(brCodeBase64: string): string {
  if (brCodeBase64.startsWith('data:')) return brCodeBase64;
  return `${PNG_DATA_URI_PREFIX}${brCodeBase64}`;
}

/**
 * Datas de billing chegam no formato SQLite UTC ('YYYY-MM-DD HH:MM:SS', sem
 * 'T'/'Z' — ver `docs/decisions/billing.md`): sem tratamento, o `Date` nativo
 * interpretaria essa string como HORA LOCAL, não UTC. Strings que já vierem
 * com 'T' (ISO) passam direto.
 */
function parseInstantMs(value: string): number {
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(iso).getTime();
}

/**
 * Segundos restantes até `expiresAt`, com `nowMs` injetado (nada de
 * `Date.now()` dentro de função pura). `null` para "sem expiração conhecida"
 * (mesma semântica de `expires_at: null` no backend); negativo é clampado a 0.
 */
export function remainingSeconds(expiresAt: string | null, nowMs: number): number | null {
  if (expiresAt == null) return null;
  const expiresMs = parseInstantMs(expiresAt);
  if (Number.isNaN(expiresMs)) return null;
  return Math.max(0, Math.round((expiresMs - nowMs) / 1000));
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export type ChargeUiState = 'idle' | 'awaiting' | 'paid' | 'expired' | 'error';

/**
 * Única autoridade sobre expiração no cliente: cruza `status` e `expires_at`.
 * PENDING com prazo vencido é tratado como expirado mesmo que o servidor
 * ainda não tenha persistido essa transição (o polling seguinte corrige).
 */
export function chargeUiState(charge: PixCharge | null, nowMs: number): ChargeUiState {
  if (!charge) return 'idle';
  if (charge.status === 'PAID') return 'paid';
  if (charge.status === 'PENDING') {
    if (charge.expires_at != null && parseInstantMs(charge.expires_at) <= nowMs) return 'expired';
    return 'awaiting';
  }
  if (charge.status === 'EXPIRED') return 'expired';
  // CANCELLED / REFUNDED: estado final que não é sucesso nem "aguardando".
  return 'error';
}

export function shouldKeepPolling(state: ChargeUiState): boolean {
  return state === 'awaiting';
}

const POLL_DELAYS_MS = [3000, 3000, 5000, 8000];
const POLL_DELAY_CAP_MS = 15000;

/** Backoff 3s→3s→5s→8s, teto 15s. `attempt` é 0-based (tentativa que já passou). */
export function nextPollDelayMs(attempt: number): number {
  if (attempt < 0) return POLL_DELAYS_MS[0];
  if (attempt < POLL_DELAYS_MS.length) return POLL_DELAYS_MS[attempt];
  return POLL_DELAY_CAP_MS;
}

export type PlanBadge = 'none' | 'active' | 'expired' | 'pending' | 'staging';

interface MinimalSubResponse {
  billingEnabled: boolean;
  subscription: Subscription | null;
}

/** `billingEnabled: false` (staging) some com qualquer bloqueio, independente da assinatura. */
export function planBadge(sub: MinimalSubResponse, nowMs: number): PlanBadge {
  if (!sub.billingEnabled) return 'staging';
  const s = sub.subscription;
  if (!s) return 'none';
  if (s.status === 'pending') return 'pending';
  if (s.status === 'canceled') return 'none';
  if (s.status === 'expired') return 'expired';
  // active: mas espelha a mesma checagem de vencimento do server (T-070) —
  // se `current_period_end` já passou, o cliente não deve continuar exibindo
  // "active" só porque o GET /me anterior ainda não recalculou.
  if (s.current_period_end != null && parseInstantMs(s.current_period_end) <= nowMs) {
    return 'expired';
  }
  return 'active';
}
