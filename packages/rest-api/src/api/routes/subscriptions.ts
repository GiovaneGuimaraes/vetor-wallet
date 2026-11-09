import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { log } from '../logger';
import { createSqliteQuery } from '@vetor-wallet/query';
import type { MySubscriptionResponse, SyncSubscriptionResponse } from '@vetor-wallet/shared';
import {
  AbacatePayError,
  cancelSubscription,
  createCustomerPortal,
  createPixCharge,
  getActivePlan,
  getBillingCustomer,
  getLatestCheckout,
  getLatestCompletedCheckout,
  getOpenCheckout,
  getPendingCharge,
  getSubscription,
  getSubscriptionRow,
  isAbacatePayConfigured,
  isActivationPending,
  isBillingEnabled,
  isSubscriptionActive,
  nowSqliteUtc,
  reconcileCardSubscription,
  type ApplyResult,
  toPixCharge,
  toPlan,
  toSqliteUtcFromProvider,
  toSubscription,
  type PixChargeRow,
} from '@vetor-wallet/subscription-core';

const router = Router();

// Mesma ponte das demais rotas migradas (T-114): o core fala `Query` com
// `$1, $2…` e este adaptador os traduz para o libSQL de hoje.
const query = createSqliteQuery(db);

router.use(requireAuth);

/**
 * Assina um plano: cria (ou reaproveita) a cobrança Pix e deixa a assinatura em
 * `pending` até o pagamento ser confirmado — quem ativa é sempre
 * `markChargePaidAndActivate` (webhook, polling ou simulação).
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

    const now = nowSqliteUtc();
    const existingSub = await getSubscriptionRow({ query, userId });
    if (isSubscriptionActive(existingSub, now)) {
      res.status(409).json({ code: 'ALREADY_SUBSCRIBED', error: 'Já existe uma assinatura ativa' });
      return;
    }

    // Reaproveita a cobrança PENDING não expirada do MESMO plano em vez de
    // gerar outra: dois QR Codes válidos ao mesmo tempo é convite a pagar duas
    // vezes. Nenhum fetch é feito aqui.
    const reusable = await getPendingCharge({ query, userId, nowIso: now, planId: plan.id });
    if (reusable) {
      const sub = await getSubscriptionRow({ query, userId });
      res.status(201).json({
        subscription: sub ? toSubscription(sub) : null,
        charge: toPixCharge(reusable),
      });
      return;
    }

    if (!isAbacatePayConfigured()) {
      res
        .status(503)
        .json({ code: 'BILLING_NOT_CONFIGURED', error: 'Pagamento não está configurado' });
      return;
    }

    let charge;
    try {
      charge = await createPixCharge({
        amountCents: Number(plan.price_cents),
        description: `Vetor Wallet - ${plan.name}`,
        externalId: `user:${userId}:plan:${plan.id}:${Date.now()}`,
        metadata: { userId, planId: plan.id },
      });
    } catch (err) {
      if (err instanceof AbacatePayError) {
        // O 502 esconde a causa do usuário (de propósito); o log guarda o status
        // do provedor (0 = rede/timeout, 400 = payload recusado…) para a
        // investigação não depender de reproduzir a chamada na mão.
        log('warn', 'billing.charge.failed', { planId: plan.id, providerStatus: err.status });
        res
          .status(502)
          .json({ code: 'PAYMENT_PROVIDER_ERROR', error: 'Provedor de pagamento indisponível' });
        return;
      }
      throw err;
    }

    // A cobrança é criada no provedor ANTES do INSERT porque só a resposta dele
    // traz o `abacate_charge_id` (chave de reconciliação do webhook) — gravar
    // antes exigiria uma linha sem id, e depois um UPDATE que pode falhar.
    // RISCO ACEITO: se este INSERT falhar, fica uma cobrança órfã no provedor.
    // É inofensiva: ninguém recebe o QR Code, e se por acaso for paga o webhook
    // não acha a linha e responde 200 `unknownCharge`, sem ativar nada.
    await db.execute({
      sql: `INSERT INTO pix_charges
              (user_id, plan_id, abacate_charge_id, amount_cents, status,
               br_code, br_code_base64, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        userId,
        plan.id,
        charge.id,
        charge.amount,
        charge.status,
        charge.brCode,
        charge.brCodeBase64,
        toSqliteUtcFromProvider(charge.expiresAt),
      ],
    });

    // Garante a assinatura em `pending` sem tocar `current_period_end`: se o
    // usuário já teve um período pago (assinatura vencida renovando), aquele
    // valor é a base do próximo cálculo em `renewalBase` e não pode ser zerado.
    await db.execute({
      sql: `INSERT INTO subscriptions (user_id, plan_id, status)
            VALUES (?, ?, 'pending')
            ON CONFLICT(user_id) DO UPDATE SET
              plan_id = excluded.plan_id,
              status = 'pending',
              updated_at = datetime('now')`,
      args: [userId, plan.id],
    });

    const [subRow, chargeRow] = await Promise.all([
      getSubscriptionRow({ query, userId }),
      db.execute({
        sql: 'SELECT * FROM pix_charges WHERE abacate_charge_id = ?',
        args: [charge.id],
      }),
    ]);

    res.status(201).json({
      subscription: subRow ? toSubscription(subRow) : null,
      charge: toPixCharge(chargeRow.rows[0] as unknown as PixChargeRow),
    });
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
  const pending = await getPendingCharge({ query, userId, nowIso: now });
  const openCheckout = await getOpenCheckout({ query, userId });
  const completed = await getLatestCompletedCheckout({ query, userId });

  return {
    billingEnabled: isBillingEnabled(),
    subscription,
    // Plano resolvido mesmo se desativado (ver `getActivePlan`).
    plan: planRow ? toPlan(planRow) : null,
    pendingCharge: pending ? toPixCharge(pending) : null,
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
