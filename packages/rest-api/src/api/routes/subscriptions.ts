import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { MySubscriptionResponse } from '@vetor-wallet/shared';
import {
  AbacatePayError,
  createPixCharge,
  getActivePlan,
  getPendingCharge,
  getSubscriptionRow,
  isAbacatePayConfigured,
  isBillingEnabled,
  isSubscriptionActive,
  nowSqliteUtc,
  toPixCharge,
  toPlan,
  toSqliteUtcFromProvider,
  toSubscription,
  type PixChargeRow,
} from '@vetor-wallet/subscription-core';

const router = Router();

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

    const plan = await getActivePlan({ db, planId });
    // Plano inexistente e plano desativado respondem o MESMO 404, de propósito:
    // para quem assina, os dois casos são "esse plano não está à venda", e
    // distinguir só entregaria a existência de planos fora da vitrine.
    if (!plan || Number(plan.active) !== 1) {
      res.status(404).json({ error: 'Plano não encontrado' });
      return;
    }

    const now = nowSqliteUtc();
    const existingSub = await getSubscriptionRow({ db, userId });
    if (isSubscriptionActive(existingSub, now)) {
      res.status(409).json({ code: 'ALREADY_SUBSCRIBED', error: 'Já existe uma assinatura ativa' });
      return;
    }

    // Reaproveita a cobrança PENDING não expirada do MESMO plano em vez de
    // gerar outra: dois QR Codes válidos ao mesmo tempo é convite a pagar duas
    // vezes. Nenhum fetch é feito aqui.
    const reusable = await getPendingCharge({ db, userId, nowIso: now, planId: plan.id });
    if (reusable) {
      const sub = await getSubscriptionRow({ db, userId });
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
        description: `Vetor Wallet — ${plan.name}`,
        externalId: `user:${userId}:plan:${plan.id}:${Date.now()}`,
        metadata: { userId, planId: plan.id },
      });
    } catch (err) {
      if (err instanceof AbacatePayError) {
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
      getSubscriptionRow({ db, userId }),
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
    const userId = res.locals.userId as number;
    const now = nowSqliteUtc();

    const subRow = await getSubscriptionRow({ db, userId });
    let subscription = subRow ? toSubscription(subRow) : null;

    // `active` com período vencido é reportado como `expired` — computado na
    // LEITURA, sem gravar: a transição de estado pertence a quem cobra
    // (renovação/webhook), e um GET que escreve no banco viraria fonte de
    // corrida com a ativação.
    if (subscription && subscription.status === 'active' && !isSubscriptionActive(subRow, now)) {
      subscription = { ...subscription, status: 'expired' };
    }

    const planRow = subscription ? await getActivePlan({ db, planId: subscription.plan_id }) : null;
    const pending = await getPendingCharge({ db, userId, nowIso: now });

    const body: MySubscriptionResponse = {
      billingEnabled: isBillingEnabled(),
      subscription,
      // Plano resolvido mesmo se desativado (ver `getActivePlan`).
      plan: planRow ? toPlan(planRow) : null,
      pendingCharge: pending ? toPixCharge(pending) : null,
    };
    res.json(body);
  })
);

export default router;
