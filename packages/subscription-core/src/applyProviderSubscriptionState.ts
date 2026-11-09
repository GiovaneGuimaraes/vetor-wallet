import type { Query } from '@vetor-wallet/query';

import { addInterval } from './addInterval';
import { getActivePlan } from './getActivePlan';
import { isActivationPending } from './isActivationPending';
import { parseInstant } from './parseInstant';
import type { AbacateSubscription } from './providers/abacatepay/AbacateSubscription';
import { renewalBase } from './renewalBase';
import { toSqliteUtc } from './toSqliteUtc';

/** Quanto antes do fim do período uma renovação é aceita (webhook ou deduzida). */
export const RENEWAL_WINDOW_DAYS = 3;

/** Tentativas do UPSERT otimista da ativação antes de desistir alto. */
export const MAX_ACTIVATION_ATTEMPTS = 3;

export type SubscriptionTransition =
  'activate' | 'renew' | 'payment_failed' | 'cancel' | 'plan_changed' | 'provider_status';

/**
 * O que a porta usa do provedor. SÓ `id`, `status`, `providerStatus` e a data
 * de próxima cobrança — os demais campos de `AbacateSubscription` nunca foram
 * observados num pagamento real (nota do revisor da T-124a) e não decidem nada.
 */
export type SubscriptionSnapshot = Pick<
  AbacateSubscription,
  'id' | 'status' | 'providerStatus' | 'nextBillingAt'
>;

/** `checkoutId` = `bill_…`; `subscriptionId` = `subs_…`. */
export type SubscriptionRef = { checkoutId: string } | { subscriptionId: string };

export type ApplyReason =
  | 'requires_checkout'
  | 'not_active'
  | 'missing_subscription_id'
  | 'unknown_checkout'
  | 'already_applied'
  | 'duplicate'
  | 'unknown_subscription'
  | 'provider_not_renewed'
  | 'not_due'
  | 'missing_product'
  | 'unknown_product'
  | 'remote_not_actionable';

export interface ApplyResult {
  /** true só quando ESTA chamada mudou o estado. */
  applied: boolean;
  transition: SubscriptionTransition;
  /** Dono — SEMPRE do nosso banco (`subscription_checkouts`/`subscriptions`), nunca do payload. */
  userId: number | null;
  /** Por que não aplicou (ausente quando `applied`). */
  reason?: ApplyReason;
  /** Duas assinaturas de cartão pagas: a rota cancela `subscriptionIdToCancel` e registra. */
  duplicate?: boolean;
  subscriptionIdToCancel?: string;
  /** Fim do período gravado (activate/renew aplicados). */
  currentPeriodEnd?: string;
  /** Status cru do provedor quando ele não permite ação (`remote_not_actionable`). */
  providerStatus?: string | null;
}

/** Leitura da linha do usuário usada pela ativação, pelo checkout e pela reconciliação. */
export const selectUserSubscriptionText = `SELECT status, current_period_end, abacate_subscription_id, updated_at
            FROM subscriptions WHERE user_id = $1`;

interface Ctx {
  query: Query;
  ref: SubscriptionRef;
  transition: SubscriptionTransition;
  snapshot: SubscriptionSnapshot;
  now: string;
  plan?: { productId: string | null };
}

interface CardSubRow {
  user_id: number;
  plan_id: number;
  status: string;
  current_period_end: string | null;
}

const result = (
  ctx: Ctx,
  applied: boolean,
  userId: number | null,
  extra: Partial<ApplyResult> = {}
): ApplyResult => {
  return { applied, transition: ctx.transition, userId, ...extra };
};

/** Data de próxima cobrança do provedor, se for válida E futura; senão `null`. */
const providerPeriodEnd = (snapshot: SubscriptionSnapshot, now: string): string | null => {
  if (!snapshot.nextBillingAt) return null;
  const at = parseInstant(snapshot.nextBillingAt);
  if (Number.isNaN(at.getTime()) || at <= parseInstant(now)) return null;
  return toSqliteUtc(at);
};

const planInterval = async (query: Query, planId: number) => {
  const plan = await getActivePlan({ query, planId });
  // `plan_id` tem FK para `plans`: ausência é banco inconsistente, não um caso.
  if (!plan) throw new Error(`Plano ${planId} não existe`);
  return plan.interval;
};

/**
 * `activate`: o checkout `bill_…` foi pago e virou a assinatura `snapshot.id`.
 *
 * 1. O UPDATE condicional de `subscription_checkouts` (`status <> 'COMPLETED'`)
 *    é QUEM DECIDE: só a chamada com `rowCount = 1` segue. Nada de período é
 *    calculado antes disso — webhook e consulta simultâneos não somam duas vezes.
 * 2. O dono e o plano vêm da LINHA do checkout (troca de plano com checkout
 *    antigo pago depois ativa o plano daquele checkout).
 * 3. O UPSERT de `subscriptions` é otimista: só grava se a linha ainda estiver
 *    como foi lida (`status`, `current_period_end`, `abacate_subscription_id`).
 *    Dois checkouts DIFERENTES pagos ao mesmo tempo ganham cada um o seu UPDATE
 *    do passo 1; sem essa condição o segundo sobrescreveria o `subs_` do
 *    primeiro, que seguiria cobrando sem ninguém saber. Com ela, o segundo
 *    relê, vê o `subs_` do primeiro e cai na regra da duplicada.
 */
const activate = async (ctx: Ctx): Promise<ApplyResult> => {
  if (!('checkoutId' in ctx.ref)) return result(ctx, false, null, { reason: 'requires_checkout' });
  if (ctx.snapshot.status !== 'ACTIVE') return result(ctx, false, null, { reason: 'not_active' });
  const subscriptionId = ctx.snapshot.id;
  if (!subscriptionId) return result(ctx, false, null, { reason: 'missing_subscription_id' });
  const checkoutId = ctx.ref.checkoutId;

  const won = await ctx.query({
    text: `UPDATE subscription_checkouts
          SET status = 'COMPLETED', abacate_subscription_id = $1, completed_at = $2
          WHERE abacate_checkout_id = $3 AND status <> 'COMPLETED'`,
    values: [subscriptionId, ctx.now, checkoutId],
  });

  const ownerRes = await ctx.query<{
    user_id: number;
    plan_id: number;
    abacate_subscription_id: string | null;
    completed_at: string | null;
  }>({
    text: `SELECT user_id, plan_id, abacate_subscription_id, completed_at
          FROM subscription_checkouts WHERE abacate_checkout_id = $1`,
    values: [checkoutId],
  });
  const owner = ownerRes.rows[0];
  if (!owner) return result(ctx, false, null, { reason: 'unknown_checkout' });
  const userId = Number(owner.user_id);

  // RECUPERAÇÃO (achado do revisor da T-124b1): `rowCount` 0 com a linha
  // existindo = o checkout JÁ estava COMPLETED. Normalmente é reentrega
  // (no-op), mas pode ser o checkout pago cuja assinatura nunca foi gravada
  // (crash entre as duas escritas, ou UPSERT que perdeu as corridas). Só segue
  // se o checkout — do NOSSO banco — tem exatamente este `subs_`, o snapshot
  // confirmou `ACTIVE` (checado acima) e, já dentro do laço,
  // `isActivationPending` diz que a linha ainda não reflete este pagamento.
  // As condições otimistas do UPSERT continuam garantindo período UMA vez.
  const recovering = won.rowCount !== 1;
  if (recovering && owner.abacate_subscription_id !== subscriptionId) {
    return result(ctx, false, userId, { reason: 'already_applied' });
  }

  const planId = Number(owner.plan_id);
  const interval = await planInterval(ctx.query, planId);
  const fromProvider = providerPeriodEnd(ctx.snapshot, ctx.now);

  for (let attempt = 0; attempt < MAX_ACTIVATION_ATTEMPTS; attempt++) {
    const subRes = await ctx.query<{
      status: string;
      current_period_end: string | null;
      abacate_subscription_id: string | null;
      updated_at: string | null;
    }>({
      text: selectUserSubscriptionText,
      values: [userId],
    });
    const sub = subRes.rows[0];

    // Esta mesma assinatura já está gravada (reentrega, recuperação que outro
    // processo já fez, ou o mesmo subs_ por outro checkout): nem estende de
    // novo, nem manda cancelar a assinatura que está valendo. No-op.
    if (sub && sub.abacate_subscription_id === subscriptionId) {
      return result(ctx, false, userId, { reason: 'already_applied' });
    }
    // Recuperando, mas a linha não está no estado "pago sem assinatura": é
    // histórico (duplicada antiga, assinatura já substituída). No-op — sem
    // estender e sem acusar duplicada de novo.
    if (recovering && !isActivationPending(owner, sub)) {
      return result(ctx, false, userId, { reason: 'already_applied' });
    }

    // Duplicada: o usuário já tem OUTRA assinatura de cartão viva (não
    // cancelada) — cobrando. Não estende nada; a mais nova (esta) é a que a
    // rota cancela no provedor, e o reembolso vai para o TODO-HUMANO.
    if (sub && sub.abacate_subscription_id && sub.status === 'active') {
      return result(ctx, false, userId, {
        reason: 'duplicate',
        duplicate: true,
        subscriptionIdToCancel: subscriptionId,
      });
    }

    const periodEnd =
      fromProvider ?? addInterval(renewalBase(ctx.now, sub?.current_period_end ?? null), interval);

    const upsert = await ctx.query({
      text: `INSERT INTO subscriptions
              (user_id, plan_id, status, current_period_end, provider, abacate_subscription_id,
               provider_status, canceled_at, created_at, updated_at)
            VALUES ($1, $2, 'active', $3, 'abacatepay_card', $4, $5, NULL, $6, $7)
            ON CONFLICT(user_id) DO UPDATE SET
              plan_id = excluded.plan_id,
              status = 'active',
              current_period_end = excluded.current_period_end,
              provider = excluded.provider,
              abacate_subscription_id = excluded.abacate_subscription_id,
              provider_status = excluded.provider_status,
              canceled_at = NULL,
              updated_at = excluded.updated_at
            WHERE subscriptions.status = $8
              AND COALESCE(subscriptions.current_period_end, '') = $9
              AND COALESCE(subscriptions.abacate_subscription_id, '') = $10`,
      values: [
        userId,
        planId,
        periodEnd,
        subscriptionId,
        ctx.snapshot.providerStatus,
        ctx.now,
        ctx.now,
        // Sem linha lida, nenhum status casa '' — se alguém inseriu no meio,
        // o conflito vira no-op e a volta seguinte relê.
        sub?.status ?? '',
        sub?.current_period_end ?? '',
        sub?.abacate_subscription_id ?? '',
      ],
    });
    if (upsert.rowCount === 1) {
      return result(ctx, true, userId, { currentPeriodEnd: periodEnd });
    }
  }

  // Três trocas concorrentes seguidas na mesma linha: não chuta. O checkout já
  // está COMPLETED; se a linha seguir `pending`, `isActivationPending` marca o
  // estado e a próxima reconciliação (ou reentrega) recupera.
  throw new Error(
    `Ativação de ${subscriptionId} (usuário ${userId}) perdeu ${MAX_ACTIVATION_ATTEMPTS} corridas seguidas`
  );
};

const resolveSubscriptionId = async (ctx: Ctx): Promise<string | null> => {
  if ('subscriptionId' in ctx.ref) return ctx.ref.subscriptionId;
  const res = await ctx.query<{ abacate_subscription_id: string | null }>({
    text: `SELECT abacate_subscription_id FROM subscription_checkouts
          WHERE abacate_checkout_id = $1`,
    values: [ctx.ref.checkoutId],
  });
  return res.rows[0]?.abacate_subscription_id ?? null;
};

/**
 * `renew`: UPDATE ancorado no PRÓPRIO fim do período. A condição
 * `current_period_end = $antigo` faz webhook e consulta (renovação deduzida)
 * não estenderem duas vezes: o segundo encontra o fim já mudado e vira no-op.
 * A janela (`<= agora + RENEWAL_WINDOW_DAYS`) impede que um `ACTIVE` lido no
 * meio do período estenda antes da hora.
 */
const renew = async (ctx: Ctx, subscriptionId: string, row: CardSubRow) => {
  const userId = Number(row.user_id);
  if (ctx.snapshot.status !== 'ACTIVE') return result(ctx, false, userId, { reason: 'not_active' });

  const oldEnd = row.current_period_end;
  const fromProvider = providerPeriodEnd(ctx.snapshot, ctx.now);
  // O provedor diz que a próxima cobrança é até o fim que já temos: ele ainda
  // NÃO renovou. Em dúvida, nega.
  if (fromProvider && oldEnd && parseInstant(fromProvider) <= parseInstant(oldEnd)) {
    return result(ctx, false, userId, { reason: 'provider_not_renewed' });
  }

  const interval = await planInterval(ctx.query, Number(row.plan_id));
  const newEnd = fromProvider ?? addInterval(renewalBase(ctx.now, oldEnd), interval);
  const windowLimit = toSqliteUtc(
    new Date(parseInstant(ctx.now).getTime() + RENEWAL_WINDOW_DAYS * 86_400_000)
  );

  const res = await ctx.query({
    text: `UPDATE subscriptions
          SET current_period_end = $1, provider_status = $2, updated_at = $3
          WHERE abacate_subscription_id = $4 AND status = 'active'
            AND current_period_end = $5 AND current_period_end <= $6`,
    values: [newEnd, ctx.snapshot.providerStatus, ctx.now, subscriptionId, oldEnd, windowLimit],
  });
  return res.rowCount === 1
    ? result(ctx, true, userId, { currentPeriodEnd: newEnd })
    : result(ctx, false, userId, { reason: 'not_due' });
};

const updateByRowCount = async (
  ctx: Ctx,
  userId: number,
  text: string,
  values: unknown[]
): Promise<ApplyResult> => {
  const res = await ctx.query({ text, values });
  return res.rowCount === 1
    ? result(ctx, true, userId)
    : result(ctx, false, userId, { reason: 'already_applied' });
};

/**
 * **A porta única da assinatura de cartão** (T-124b1, plano §C). Webhook
 * (`subscription.*`, T-124d) e consulta (`reconcileCardSubscription`) chamam
 * esta função; nenhum outro código grava ativação, renovação ou cancelamento.
 *
 * Regras que valem para todas as transições:
 *
 * - **Decide pelo `rowCount` do UPDATE condicional, nunca por um SELECT
 *   anterior.** Os SELECTs daqui só acham o dono e o plano; quem diz "esta
 *   chamada aplicou" é sempre o `rowCount` de uma escrita com a condição no
 *   `WHERE`. (`markChargePaidAndActivate`, a porta do Pix, lê e depois grava sem
 *   olhar `rowCount` — tem corrida; esta não copia o padrão.)
 * - **O dono vem do nosso banco**: `subscription_checkouts.user_id` na ativação,
 *   `subscriptions.user_id` (pelo `abacate_subscription_id`) no resto. Nada do
 *   payload decide de quem é.
 * - Em dúvida entre dar e negar acesso, **nega** e devolve o motivo — a rota
 *   loga. Dar acesso sem pagamento é o pior erro deste domínio.
 *
 * Transições:
 * - `activate` — só por `{checkoutId}` e com `snapshot.status === 'ACTIVE'`.
 * - `renew` — `ACTIVE`; estende uma vez por fim de período, dentro da janela.
 * - `payment_failed` — só `provider_status = 'PAYMENT_FAILED'`; o acesso segue
 *   até o fim do período e expira sozinho.
 * - `cancel` — `status = 'canceled'` + `canceled_at`; o período pago continua
 *   valendo (`isSubscriptionActive`).
 * - `plan_changed` — acha o plano por `plans.abacate_product_id`
 *   (`plan.productId`); produto desconhecido → no-op com motivo.
 *
 * Erro de banco sobe (a rota responde 500 e o provedor/usuário tenta de novo).
 */
export const applyProviderSubscriptionState = async (args: {
  query: Query;
  ref: SubscriptionRef;
  transition: SubscriptionTransition;
  snapshot: SubscriptionSnapshot;
  nowIso: string;
  plan?: { productId: string | null };
}): Promise<ApplyResult> => {
  const ctx: Ctx = {
    query: args.query,
    ref: args.ref,
    transition: args.transition,
    snapshot: args.snapshot,
    now: toSqliteUtc(parseInstant(args.nowIso)),
    plan: args.plan,
  };

  if (ctx.transition === 'activate') return activate(ctx);

  const subscriptionId = await resolveSubscriptionId(ctx);
  if (!subscriptionId) return result(ctx, false, null, { reason: 'unknown_subscription' });

  const rowRes = await ctx.query<CardSubRow>({
    text: `SELECT user_id, plan_id, status, current_period_end
          FROM subscriptions WHERE abacate_subscription_id = $1`,
    values: [subscriptionId],
  });
  const row = rowRes.rows[0];
  if (!row) return result(ctx, false, null, { reason: 'unknown_subscription' });
  const userId = Number(row.user_id);

  switch (ctx.transition) {
    case 'renew':
      return renew(ctx, subscriptionId, row);

    case 'payment_failed':
      return updateByRowCount(
        ctx,
        userId,
        `UPDATE subscriptions SET provider_status = 'PAYMENT_FAILED', updated_at = $1
        WHERE abacate_subscription_id = $2
          AND COALESCE(provider_status, '') <> 'PAYMENT_FAILED'`,
        [ctx.now, subscriptionId]
      );

    case 'cancel':
      return updateByRowCount(
        ctx,
        userId,
        `UPDATE subscriptions
        SET status = 'canceled', canceled_at = $1, provider_status = $2, updated_at = $3
        WHERE abacate_subscription_id = $4 AND status <> 'canceled'`,
        [ctx.now, ctx.snapshot.providerStatus ?? 'CANCELLED', ctx.now, subscriptionId]
      );

    case 'provider_status': {
      // Status remoto que não permite ação (PENDING/UNKNOWN): o `status` local
      // NÃO muda; só registra o que o provedor disse, para a rota mostrar.
      // `applied` segue o `rowCount` como nas outras transições (true = gravou
      // um provider_status novo); o acesso nunca muda aqui.
      const providerStatus = ctx.snapshot.providerStatus ?? 'UNKNOWN';
      const res = await ctx.query({
        text: `UPDATE subscriptions SET provider_status = $1, updated_at = $2
              WHERE abacate_subscription_id = $3 AND COALESCE(provider_status, '') <> $4`,
        values: [providerStatus, ctx.now, subscriptionId, providerStatus],
      });
      return result(ctx, res.rowCount === 1, userId, {
        reason: 'remote_not_actionable',
        providerStatus,
      });
    }

    default: {
      // plan_changed
      const productId = ctx.plan?.productId;
      if (!productId) return result(ctx, false, userId, { reason: 'missing_product' });
      const planRes = await ctx.query<{ id: number }>({
        text: 'SELECT id FROM plans WHERE abacate_product_id = $1',
        values: [productId],
      });
      const plan = planRes.rows[0];
      if (!plan) return result(ctx, false, userId, { reason: 'unknown_product' });
      return updateByRowCount(
        ctx,
        userId,
        `UPDATE subscriptions SET plan_id = $1, updated_at = $2
        WHERE abacate_subscription_id = $3 AND plan_id <> $4`,
        [Number(plan.id), ctx.now, subscriptionId, Number(plan.id)]
      );
    }
  }
};
