import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { log } from '../logger';
import { createSqliteQuery } from '@vetor-wallet/query';
import { findUserById } from '@vetor-wallet/auth-core';
import type {
  CreateSubscriptionResponse,
  MySubscriptionResponse,
  SyncSubscriptionResponse,
} from '@vetor-wallet/shared';
import {
  AbacatePayError,
  assertCanStartCheckout,
  billingCustomerName,
  cancelSubscription,
  createCustomerPortal,
  ensureBillingCustomer,
  getActivePlan,
  getBillingCustomer,
  getLatestCheckout,
  getLatestCompletedCheckout,
  getOpenCheckout,
  getSubscription,
  getSubscriptionRow,
  isAbacatePayConfigured,
  isActivationPending,
  isBillingEnabled,
  isSubscriptionActive,
  nowSqliteUtc,
  reconcileCardSubscription,
  startCardCheckout,
  type ApplyResult,
  toPlan,
  toSubscription,
} from '@vetor-wallet/subscription-core';
import { mapBillingError } from '../billingErrors';
import { appOrigin, checkoutReturnUrls } from '../checkoutReturnUrls';

const router = Router();

// Mesma ponte das demais rotas migradas (T-114): o core fala `Query` com
// `$1, $2…` e este adaptador os traduz para o libSQL de hoje.
const query = createSqliteQuery(db);

router.use(requireAuth);

/**
 * Assina um plano NO CARTÃO (T-124c): abre (ou reaproveita) o checkout
 * hospedado da AbacatePay e devolve a URL para o web redirecionar. A
 * assinatura fica `pending` até o pagamento; quem ativa é a porta única
 * (`applyProviderSubscriptionState`), pelo `/sync` (e pelo webhook, T-124d).
 *
 * A regra (quem pode assinar, reaproveitar/supersede, trava de corrida) é do
 * `startCardCheckout`; esta rota cruza os módulos (e-mail/nome do auth-core →
 * cliente da AbacatePay), monta as URLs de volta SÓ do env e traduz os erros.
 * Corpo de resposta: só o id LOCAL e a URL hospedada — `bill_`/`subs_`/`cust_`
 * ficam no banco.
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { planId } = req.body as { planId?: unknown };

    if (typeof planId !== 'number' || !Number.isInteger(planId) || planId <= 0) {
      res.status(400).json({ error: 'planId deve ser um inteiro maior que 0' });
      return;
    }

    const plan = await getActivePlan({ query, planId });
    // Plano inexistente e plano desativado respondem o MESMO 404, de propósito:
    // para quem assina, os dois casos são "esse plano não está à venda", e
    // distinguir só entregaria a existência de planos fora da vitrine.
    if (!plan || Number(plan.active) !== 1) {
      res.status(404).json({ error: 'Plano não encontrado' });
      return;
    }

    // Antes de QUALQUER escrita (local ou no provedor).
    if (!isAbacatePayConfigured()) {
      res
        .status(503)
        .json({ code: 'BILLING_NOT_CONFIGURED', error: 'Pagamento não está configurado' });
      return;
    }

    try {
      // Pergunta ANTES de criar o cliente: um assinante (Pix legado no
      // período, cartão ativo, pago confirmando) leva 409 sem ganhar um `cust_`
      // na AbacatePay. `startCardCheckout` repete a checagem (é a dele).
      await assertCanStartCheckout({ query, userId, now: nowSqliteUtc() });

      const user = await findUserById({ query, userId });
      if (!user) throw new Error(`usuário ${userId} da sessão não existe em users`);

      const customer = await ensureBillingCustomer({
        query,
        userId,
        email: user.email,
        name: billingCustomerName({ name: user.name, email: user.email }),
      });
      log('info', customer.created ? 'billing.customer.created' : 'billing.customer.reused', {
        userId,
      });
      if (customer.orphanCustomerId) {
        // O id órfão é do provedor: não vai ao log. O humano acha pelo e-mail
        // no painel da AbacatePay (dois clientes com o mesmo e-mail).
        log('warn', 'billing.customer.orphan', { userId, reason: 'lost_insert_race' });
      }

      const checkout = await startCardCheckout({
        query,
        userId,
        plan,
        customerId: customer.customerId,
        ...checkoutReturnUrls(appOrigin()),
        nowIso: nowSqliteUtc(),
      });
      log('info', 'billing.checkout.created', {
        userId,
        planId: plan.id,
        reused: checkout.reused,
        superseded: checkout.supersededCheckoutId !== null,
      });
      if (checkout.supersededDeleteFailed) {
        log('warn', 'billing.checkout.supersededDeleteFailed', { userId, planId: plan.id });
      }

      const sub = await getSubscriptionRow({ query, userId });
      const body: CreateSubscriptionResponse = {
        subscription: sub ? toSubscription(sub) : null,
        checkout: { id: checkout.checkoutId, url: checkout.url },
      };
      res.status(201).json(body);
    } catch (err) {
      const mapped = mapBillingError(err);
      if (mapped) {
        log('info', 'billing.checkout.refused', {
          userId,
          planId: plan.id,
          reason: mapped.body.code,
        });
        res.status(mapped.status).json(mapped.body);
        return;
      }
      if (err instanceof AbacatePayError) {
        // O 502 esconde a causa do usuário (de propósito); o log guarda o status
        // do provedor (0 = rede/timeout, 400 = payload recusado…) para a
        // investigação não depender de reproduzir a chamada na mão. Nunca o
        // corpo nem ids do provedor.
        log('warn', 'billing.checkout.failed', {
          userId,
          planId: plan.id,
          providerStatus: err.status,
        });
        res
          .status(502)
          .json({ code: 'PAYMENT_PROVIDER_ERROR', error: 'Provedor de pagamento indisponível' });
        return;
      }
      throw err;
    }
  })
);

/**
 * Estado de billing do usuário logado. **Sempre 200**, inclusive sem assinatura
 * nenhuma — é leitura de estado, não busca de recurso.
 */
router.get(
  '/me',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await buildMe(res.locals.userId as number));
  })
);

/**
 * Corpo do `/me` — SÓ LEITURA (compartilhado com o `/sync`, que grava ANTES de
 * chamar isto e nunca durante).
 */
async function buildMe(userId: number): Promise<MySubscriptionResponse> {
  const now = nowSqliteUtc();

  const subRow = await getSubscriptionRow({ query, userId });
  let subscription = subRow ? toSubscription(subRow) : null;

  // `active` com período vencido é reportado como `expired` — computado na
  // LEITURA, sem gravar: a transição de estado pertence a quem cobra
  // (renovação/webhook), e um GET que escreve no banco viraria fonte de
  // corrida com a ativação.
  if (subscription && subscription.status === 'active' && !isSubscriptionActive(subRow, now)) {
    subscription = { ...subscription, status: 'expired' };
  }

  const planRow = subscription
    ? await getActivePlan({ query, planId: subscription.plan_id })
    : null;
  const openCheckout = await getOpenCheckout({ query, userId });
  const completed = await getLatestCompletedCheckout({ query, userId });

  return {
    billingEnabled: isBillingEnabled(),
    subscription,
    // Plano resolvido mesmo se desativado (ver `getActivePlan`).
    plan: planRow ? toPlan(planRow) : null,
    // Só a URL hospedada: `abacate_checkout_id` e demais ids do provedor ficam no banco.
    pendingCheckout: openCheckout
      ? {
          url: openCheckout.checkout_url,
          plan_id: openCheckout.plan_id,
          created_at: openCheckout.created_at,
        }
      : null,
    confirming: isActivationPending(
      completed,
      subRow
        ? {
            status: subRow.status,
            abacate_subscription_id: subRow.abacate_subscription_id ?? null,
            updated_at: subRow.updated_at ?? null,
          }
        : null
    ),
  };
}

/** Razões que são o fluxo normal (idempotência/espera); as demais são anomalia. */
const EXPECTED_SYNC_REASONS = new Set(['already_applied', 'not_due', 'provider_not_renewed']);

/**
 * Reconcilia o estado local com a AbacatePay por CONSULTA (decisão 3: sem
 * deploy público não há webhook) e devolve o `/me`. A regra — throttling,
 * idempotência, o que vira ativação/renovação/cancelamento — é do
 * `reconcileCardSubscription`; esta rota só orquestra e loga. Fora do
 * `requireActiveSubscription` de propósito: quem acabou de pagar ainda não tem
 * assinatura ativa.
 */
router.post(
  '/sync',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;

    const outcome = await reconcileCardSubscription({ query, userId, nowIso: nowSqliteUtc() });

    if (outcome.throttled) log('info', 'billing.sync', { userId, throttled: true });
    if (outcome.providerUnavailable) {
      log('warn', 'billing.sync', { userId, reason: 'provider_unavailable' });
    }
    for (const result of outcome.results) {
      logSyncResult(userId, result);
      if (result.duplicate && result.subscriptionIdToCancel) {
        await handleDuplicate(userId, result.subscriptionIdToCancel);
      }
    }

    const body: SyncSubscriptionResponse = await buildMe(userId);
    if (outcome.providerUnavailable) body.providerUnavailable = true;
    res.json(body);
  })
);

function logSyncResult(userId: number, result: ApplyResult): void {
  const expected = result.applied || (result.reason && EXPECTED_SYNC_REASONS.has(result.reason));
  log(expected ? 'info' : 'warn', 'billing.sync', {
    userId,
    transition: result.transition,
    applied: result.applied,
    reason: result.reason ?? null,
    providerStatus: result.providerStatus ?? null,
    duplicate: result.duplicate === true,
  });
}

/**
 * Assinatura duplicada (decisão 6): cancela a mais nova no provedor e RELÊ para
 * provar — a API pode devolver `data: null` no cancel, então a resposta dele
 * não prova nada. O aviso ao humano (reembolso) é o log; a rota não escreve
 * arquivo nenhum.
 */
async function handleDuplicate(userId: number, subscriptionId: string): Promise<void> {
  let confirmed = false;
  let providerStatus: string | null = null;
  try {
    await cancelSubscription(subscriptionId);
    const after = await getSubscription(subscriptionId);
    providerStatus = after.providerStatus;
    confirmed = after.status === 'CANCELLED';
  } catch (err) {
    if (!(err instanceof AbacatePayError)) throw err;
  }
  log('warn', 'billing.subscription.duplicate', {
    userId,
    cancelConfirmed: confirmed,
    providerStatus,
  });
  if (!confirmed) {
    log('error', 'billing.subscription.duplicate_cancel_unconfirmed', { userId, providerStatus });
  }
}

/**
 * Abre o portal do cliente na AbacatePay (trocar cartão, ver cobranças,
 * cancelar no fim do ciclo — decisão 4: cancelar é SÓ por aqui).
 */
router.post(
  '/portal',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;

    const customerId = await getBillingCustomer({ query, userId });
    const checkout = customerId ? await getLatestCheckout({ query, userId }) : null;
    if (!customerId || !checkout) {
      res.status(404).json({ code: 'NO_CARD_SUBSCRIPTION', error: 'Nenhuma assinatura no cartão' });
      return;
    }
    if (!isAbacatePayConfigured()) {
      res
        .status(503)
        .json({ code: 'BILLING_NOT_CONFIGURED', error: 'Pagamento não está configurado' });
      return;
    }

    try {
      const portal = await createCustomerPortal({
        customerId,
        checkoutId: checkout.abacate_checkout_id,
      });
      res.json({ url: portal.url });
    } catch (err) {
      if (err instanceof AbacatePayError) {
        log('warn', 'billing.portal.failed', { userId, providerStatus: err.status });
        res
          .status(502)
          .json({ code: 'PAYMENT_PROVIDER_ERROR', error: 'Provedor de pagamento indisponível' });
        return;
      }
      throw err;
    }
  })
);

export default router;
