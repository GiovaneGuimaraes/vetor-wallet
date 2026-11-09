import type { Query } from '@vetor-wallet/query';

import { AlreadySubscribedError } from './AlreadySubscribedError';
import { CheckoutInProgressError } from './CheckoutInProgressError';
import { type CardPlanRow, ensurePlanProduct } from './ensurePlanProduct';
import { isSubscriptionActive } from './isSubscriptionActive';
import { parseInstant } from './parseInstant';
import { createSubscriptionCheckout } from './providers/abacatepay/createSubscriptionCheckout';
import { deleteSubscriptionCheckout } from './providers/abacatepay/deleteSubscriptionCheckout';
import { toSqliteUtc } from './toSqliteUtc';

/** Linha `CREATING` mais velha que isso é de um processo que morreu no meio. */
export const STALE_CREATING_MS = 2 * 60 * 1000;

export interface StartCardCheckoutResult {
  /** Id LOCAL (`subscription_checkouts.id`). */
  checkoutId: number;
  /** `bill_…`. */
  abacateCheckoutId: string;
  /** Página hospedada de pagamento. */
  url: string;
  planId: number;
  /** true = devolveu o checkout `OPEN` do mesmo plano, sem chamar o provedor. */
  reused: boolean;
  /** `bill_…` de outro plano que esta chamada marcou `SUPERSEDED`. */
  supersededCheckoutId: string | null;
  /** Apagar o `supersededCheckoutId` no provedor falhou (fica só `SUPERSEDED` local). */
  supersededDeleteFailed: boolean;
}

interface SubRow {
  status: string;
  current_period_end: string | null;
  abacate_subscription_id: string | null;
}

interface OpenRow {
  id: number;
  plan_id: number;
  abacate_checkout_id: string | null;
  checkout_url: string | null;
}

/**
 * Abre (ou reaproveita) o checkout de assinatura no cartão (T-124b1, plano §C).
 *
 * Ordem, e por quê:
 *
 * 1. **Já assinante → `AlreadySubscribedError`.** Vale para: qualquer
 *    assinatura dentro do período (`isSubscriptionActive` — inclui Pix legado e
 *    `canceled` com período pago: só assina no cartão DEPOIS de vencer); e
 *    assinatura de cartão `active` mesmo VENCIDA localmente — o `subs_` dela
 *    pode estar cobrando (renovação ainda não reconciliada, ou cartão em
 *    retentativa). Abrir outra criaria uma segunda cobrança recorrente; o
 *    caminho é reconciliar (`sync`) ou cancelar pelo portal antes.
 * 2. `CREATING` com mais de 2 min → `FAILED` (processo morreu no meio).
 * 3. `OPEN` do MESMO plano → devolve sem chamar o provedor (dois checkouts
 *    válidos = convite a pagar duas vezes). `OPEN` de OUTRO plano →
 *    `SUPERSEDED` + tentativa de apagar no provedor (falhar não impede; se for
 *    pago mesmo assim, a porta ativa com o plano daquele checkout).
 * 4. **INSERT `CREATING` ANTES do provedor**, com `ON CONFLICT DO NOTHING`: o
 *    índice único parcial `(user_id) WHERE status IN ('CREATING','OPEN')` é a
 *    trava — sem linha devolvida, outro clique ganhou → `CheckoutInProgressError`.
 *    O `externalId` do checkout é `checkout:<id local>`, então não existe
 *    cobrança órfã (o risco aceito do Pix).
 * 5. UPSERT de `subscriptions` para `pending`, sem rebaixar linha com acesso
 *    pago no período nem tocar assinatura de cartão não cancelada, e sem
 *    escrever `provider_status`. Vem antes do provedor para que todo checkout
 *    `OPEN` tenha linha em `subscriptions` (é nela que mora o throttling do
 *    `reconcileCardSubscription`).
 * 6. Produto (`ensurePlanProduct`) e checkout no provedor. Falha → linha vira
 *    `FAILED` e o `AbacatePayError` é relançado (a rota responde 502).
 * 7. `CREATING` → `OPEN` com `bill_` e url.
 *
 * O cliente (`customerId`) chega pronto de `ensureBillingCustomer` — quem cruza
 * o auth-core (e-mail/nome) é a rota.
 */
export const startCardCheckout = async (args: {
  query: Query;
  userId: number;
  plan: CardPlanRow;
  customerId: string;
  completionUrl: string;
  returnUrl: string;
  nowIso: string;
}): Promise<StartCardCheckoutResult> => {
  const { query, userId, plan } = args;
  const planId = Number(plan.id);
  const nowDate = parseInstant(args.nowIso);
  const now = toSqliteUtc(nowDate);

  const subRes = await query<SubRow>({
    text: `SELECT status, current_period_end, abacate_subscription_id
          FROM subscriptions WHERE user_id = $1`,
    values: [userId],
  });
  const sub = subRes.rows[0];
  if (isSubscriptionActive(sub, now) || (sub?.abacate_subscription_id && sub.status === 'active')) {
    throw new AlreadySubscribedError();
  }

  await query({
    text: `UPDATE subscription_checkouts SET status = 'FAILED'
          WHERE user_id = $1 AND status = 'CREATING' AND created_at < $2`,
    values: [userId, toSqliteUtc(new Date(nowDate.getTime() - STALE_CREATING_MS))],
  });

  const openRes = await query<OpenRow>({
    text: `SELECT id, plan_id, abacate_checkout_id, checkout_url
          FROM subscription_checkouts WHERE user_id = $1 AND status = 'OPEN'`,
    values: [userId],
  });
  const open = openRes.rows[0];
  let supersededCheckoutId: string | null = null;
  let supersededDeleteFailed = false;

  if (open) {
    if (Number(open.plan_id) === planId && open.abacate_checkout_id && open.checkout_url) {
      return {
        checkoutId: Number(open.id),
        abacateCheckoutId: open.abacate_checkout_id,
        url: open.checkout_url,
        planId,
        reused: true,
        supersededCheckoutId: null,
        supersededDeleteFailed: false,
      };
    }
    const superseded = await query({
      text: `UPDATE subscription_checkouts SET status = 'SUPERSEDED'
            WHERE id = $1 AND status = 'OPEN'`,
      values: [Number(open.id)],
    });
    if (superseded.rowCount === 1 && open.abacate_checkout_id) {
      supersededCheckoutId = open.abacate_checkout_id;
      try {
        await deleteSubscriptionCheckout(open.abacate_checkout_id);
      } catch {
        supersededDeleteFailed = true;
      }
    }
  }

  const inserted = await query<{ id: number }>({
    text: `INSERT INTO subscription_checkouts (user_id, plan_id, status, created_at)
          VALUES ($1, $2, 'CREATING', $3)
          ON CONFLICT DO NOTHING
          RETURNING id`,
    values: [userId, planId, now],
  });
  const created = inserted.rows[0];
  if (!created) throw new CheckoutInProgressError();
  const checkoutId = Number(created.id);

  await query({
    text: `INSERT INTO subscriptions (user_id, plan_id, status, created_at, updated_at)
          VALUES ($1, $2, 'pending', $3, $4)
          ON CONFLICT(user_id) DO UPDATE SET
            plan_id = excluded.plan_id,
            status = 'pending',
            updated_at = excluded.updated_at
          WHERE COALESCE(subscriptions.current_period_end, '') <= $5
            AND (subscriptions.abacate_subscription_id IS NULL OR subscriptions.status = 'canceled')`,
    values: [userId, planId, now, now, now],
  });

  let bill: { id: string; url: string };
  try {
    const { productId } = await ensurePlanProduct({ query, plan });
    bill = await createSubscriptionCheckout({
      productId,
      customerId: args.customerId,
      externalId: `checkout:${checkoutId}`,
      completionUrl: args.completionUrl,
      returnUrl: args.returnUrl,
    });
  } catch (err) {
    await query({
      text: `UPDATE subscription_checkouts SET status = 'FAILED'
            WHERE id = $1 AND status = 'CREATING'`,
      values: [checkoutId],
    });
    throw err;
  }

  const opened = await query({
    text: `UPDATE subscription_checkouts
          SET status = 'OPEN', abacate_checkout_id = $1, checkout_url = $2
          WHERE id = $3 AND status = 'CREATING'`,
    values: [bill.id, bill.url, checkoutId],
  });
  if (opened.rowCount !== 1) {
    // A linha foi descartada como velha (provedor demorou >2 min) e talvez já
    // exista outro checkout no lugar dela: este `bill_` não tem dono vivo.
    // Apaga no provedor (melhor esforço) e trata como checkout concorrente.
    try {
      await deleteSubscriptionCheckout(bill.id);
    } catch {
      // ignorado: se for pago mesmo assim, a porta não acha linha com este
      // bill_ e responde `unknown_checkout` — nada é ativado sem dono.
    }
    throw new CheckoutInProgressError();
  }

  return {
    checkoutId,
    abacateCheckoutId: bill.id,
    url: bill.url,
    planId,
    reused: false,
    supersededCheckoutId,
    supersededDeleteFailed,
  };
};
