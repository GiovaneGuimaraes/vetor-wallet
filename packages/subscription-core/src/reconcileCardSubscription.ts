import type { Query } from '@vetor-wallet/query';

import {
  type ApplyResult,
  applyProviderSubscriptionState,
  RENEWAL_WINDOW_DAYS,
} from './applyProviderSubscriptionState';
import { parseInstant } from './parseInstant';
import { AbacatePayError } from './providers/abacatepay/AbacatePayError';
import { getSubscription } from './providers/abacatepay/getSubscription';
import { listSubscriptionsByCheckout } from './providers/abacatepay/listSubscriptionsByCheckout';
import { toSqliteUtc } from './toSqliteUtc';

/** Intervalo mínimo entre consultas com checkout aberto (o usuário está pagando agora). */
export const SYNC_INTERVAL_OPEN_SECONDS = 10;
/** Intervalo mínimo nos demais casos (renovação/cancelamento não têm pressa). */
export const SYNC_INTERVAL_IDLE_SECONDS = 300;

export interface ReconcileResult {
  /** true = consultado há menos de `minIntervalSeconds`; nada foi chamado no provedor. */
  throttled: boolean;
  /** Alguma chamada ao provedor falhou; o estado local segue valendo. */
  providerUnavailable: boolean;
  /** O que a porta respondeu a cada transição tentada (para a rota logar). */
  results: ApplyResult[];
}

/**
 * Reconciliação por CONSULTA à API (decisão 3 do humano: sem deploy público, o
 * webhook vem depois). Grava SÓ pela porta (`applyProviderSubscriptionState`).
 *
 * - **Throttling por UPDATE condicional em `subscriptions.last_synced_at`**:
 *   só quem consegue mover o carimbo (`rowCount` 1) consulta o provedor; o
 *   resto devolve o estado local. Intervalo: `minIntervalSeconds`, ou 10 s com
 *   checkout `OPEN` / 300 s nos demais.
 * - Checkout `OPEN` → `listSubscriptionsByCheckout` (lista vazia = ainda não
 *   pagou); assinatura `ACTIVE` com id → `activate`.
 * - Assinatura de cartão `active` com `subs_` → `getSubscription`:
 *   `CANCELLED` → `cancel`; `ACTIVE` com o fim do período dentro da janela de
 *   renovação → `renew` **deduzida**. Custo da dedução: o provedor não diz "a
 *   cobrança deste ciclo passou"; se `ACTIVE` continuar `ACTIVE` durante as
 *   retentativas de um cartão recusado, o usuário ganha até um período sem ter
 *   pago (perda máxima ~ um ciclo, aceita no plano §H). A data de próxima
 *   cobrança do provedor, quando vier válida, vence a dedução (e nega quando
 *   ela não passou do fim que já temos).
 * - **Nunca lança por erro do provedor** (`AbacatePayError` →
 *   `providerUnavailable: true`). Erro de banco sobe.
 */
export const reconcileCardSubscription = async (args: {
  query: Query;
  userId: number;
  nowIso: string;
  minIntervalSeconds?: number;
}): Promise<ReconcileResult> => {
  const { query, userId } = args;
  const nowDate = parseInstant(args.nowIso);
  const now = toSqliteUtc(nowDate);
  const out: ReconcileResult = { throttled: false, providerUnavailable: false, results: [] };

  const subRes = await query<{
    status: string;
    current_period_end: string | null;
    abacate_subscription_id: string | null;
  }>({
    text: `SELECT status, current_period_end, abacate_subscription_id
          FROM subscriptions WHERE user_id = $1`,
    values: [userId],
  });
  const sub = subRes.rows[0];
  const openRes = await query<{ abacate_checkout_id: string | null }>({
    text: `SELECT abacate_checkout_id FROM subscription_checkouts
          WHERE user_id = $1 AND status = 'OPEN'`,
    values: [userId],
  });
  const openCheckoutId = openRes.rows[0]?.abacate_checkout_id ?? null;
  // Só assinatura de cartão VIVA consulta o provedor: `canceled` é terminal, e
  // `pending` com `subs_` é a cancelada antiga de quem abriu checkout novo.
  const live =
    sub && sub.abacate_subscription_id && sub.status === 'active'
      ? { id: sub.abacate_subscription_id, end: sub.current_period_end }
      : null;

  if (!openCheckoutId && !live) return out;

  const interval =
    args.minIntervalSeconds ??
    (openCheckoutId ? SYNC_INTERVAL_OPEN_SECONDS : SYNC_INTERVAL_IDLE_SECONDS);
  const throttle = await query({
    text: `UPDATE subscriptions SET last_synced_at = $1
          WHERE user_id = $2 AND (last_synced_at IS NULL OR last_synced_at <= $3)`,
    values: [now, userId, toSqliteUtc(new Date(nowDate.getTime() - interval * 1000))],
  });
  if (throttle.rowCount !== 1) return { ...out, throttled: true };

  const providerCall = async <T>(call: () => Promise<T>): Promise<T | null> => {
    try {
      return await call();
    } catch (err) {
      if (!(err instanceof AbacatePayError)) throw err;
      out.providerUnavailable = true;
      return null;
    }
  };

  if (openCheckoutId) {
    const list = await providerCall(() => listSubscriptionsByCheckout(openCheckoutId));
    const paid = list?.find((s) => s.status === 'ACTIVE' && s.id);
    if (paid) {
      out.results.push(
        await applyProviderSubscriptionState({
          query,
          ref: { checkoutId: openCheckoutId },
          transition: 'activate',
          snapshot: paid,
          nowIso: now,
        })
      );
    }
  }

  if (live) {
    const remote = await providerCall(() => getSubscription(live.id));
    const windowLimit = new Date(nowDate.getTime() + RENEWAL_WINDOW_DAYS * 86_400_000);
    if (remote?.status === 'CANCELLED') {
      out.results.push(
        await applyProviderSubscriptionState({
          query,
          ref: { subscriptionId: live.id },
          transition: 'cancel',
          snapshot: remote,
          nowIso: now,
        })
      );
    } else if (
      remote?.status === 'ACTIVE' &&
      (!live.end || parseInstant(live.end) <= windowLimit)
    ) {
      out.results.push(
        await applyProviderSubscriptionState({
          query,
          ref: { subscriptionId: live.id },
          transition: 'renew',
          snapshot: remote,
          nowIso: now,
        })
      );
    }
  }

  return out;
};
