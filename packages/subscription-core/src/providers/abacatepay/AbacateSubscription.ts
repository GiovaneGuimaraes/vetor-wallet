/**
 * Status da assinatura no NOSSO vocabulário. A documentação do provedor
 * conflita (ACTIVE/CANCELLED na referência; PENDING/FAILED em outras páginas),
 * então o mapeador aceita os quatro e o que não reconhece vira `UNKNOWN` — nunca
 * um palpite.
 */
export type AbacateSubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'PENDING' | 'FAILED' | 'UNKNOWN';

/** Assinatura normalizada. Todo campo que o provedor não mandou (ou mandou torto) é `null`. */
export interface AbacateSubscription {
  /** `subs_…`. */
  id: string | null;
  /** `bill_…` do checkout que originou a assinatura. */
  checkoutId: string | null;
  customerId: string | null;
  /** CENTAVOS. */
  amount: number | null;
  status: AbacateSubscriptionStatus;
  /** Status cru do provedor, para `subscriptions.provider_status`. */
  providerStatus: string | null;
  method: string | null;
  trialDays: number | null;
  trialEndsAt: string | null;
  retryPolicy: Record<string, unknown> | null;
  cancelledDueTo: string | null;
  /**
   * Próxima cobrança. O nome do campo NÃO é documentado: lê-se
   * `nextBillingAt`, `nextChargeAt` ou `currentPeriodEnd`, nessa ordem, o
   * primeiro que for data válida.
   */
  nextBillingAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Assinatura como o provedor devolve — nada garantido. */
export type RawAbacateSubscription = Record<string, unknown>;

const STATUSES: Record<string, AbacateSubscriptionStatus> = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
  CANCELED: 'CANCELLED',
  PENDING: 'PENDING',
  FAILED: 'FAILED',
};

const str = (value: unknown): string | null => {
  return typeof value === 'string' && value !== '' ? value : null;
};

const num = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

/** String que o `Date` entende; o resto (lixo, número, vazio) é `null`. */
const date = (value: unknown): string | null => {
  const text = str(value);
  return text !== null && !Number.isNaN(Date.parse(text)) ? text : null;
};

/**
 * Mapeador DEFENSIVO: nunca lança por campo faltando ou de tipo errado — a
 * resposta do provedor é dado de fora e a reconciliação (T-124b1) precisa
 * decidir com o que houver, não morrer no parse.
 */
export const toAbacateSubscription = (raw: unknown): AbacateSubscription => {
  const r: RawAbacateSubscription =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as RawAbacateSubscription)
      : {};
  const providerStatus = str(r.status);
  const retryPolicy = r.retryPolicy;

  return {
    id: str(r.id),
    checkoutId: str(r.checkoutId),
    customerId: str(r.customerId),
    amount: num(r.amount),
    status: (providerStatus && STATUSES[providerStatus.toUpperCase()]) || 'UNKNOWN',
    providerStatus,
    method: str(r.method),
    trialDays: num(r.trialDays),
    trialEndsAt: date(r.trialEndsAt),
    retryPolicy:
      retryPolicy != null && typeof retryPolicy === 'object' && !Array.isArray(retryPolicy)
        ? (retryPolicy as Record<string, unknown>)
        : null,
    cancelledDueTo: str(r.cancelledDueTo),
    nextBillingAt: date(r.nextBillingAt) ?? date(r.nextChargeAt) ?? date(r.currentPeriodEnd),
    createdAt: date(r.createdAt),
    updatedAt: date(r.updatedAt),
  };
};
