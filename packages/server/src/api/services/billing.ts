/**
 * Regras de assinatura/cobrança (T-070) — a parte que decide DATA e ATIVAÇÃO.
 *
 * Duas invariantes atravessam o arquivo inteiro:
 *
 * 1. **Todo instante gravado no banco sai daqui no formato do SQLite**
 *    (`'YYYY-MM-DD HH:MM:SS'`, UTC) — nunca `toISOString()` cru. O banco compara
 *    `current_period_end` com `datetime('now')`, que produz exatamente esse
 *    formato; gravar `2026-08-01T12:00:00.000Z` faria a comparação lexicográfica
 *    mentir (o `T` é maior que qualquer dígito, então TUDO pareceria futuro).
 * 2. **`markChargePaidAndActivate` é a única porta de ativação.** Webhook,
 *    polling do front e a rota de simulação chamam essa mesma função — assim a
 *    idempotência (não somar período duas vezes) mora num lugar só.
 */

import { timingSafeEqual } from 'crypto';
import { db } from '../../db';
import type { Plan, PlanInterval, PixCharge, Subscription } from '@vetor-wallet/shared';

/** true quando o billing está ligado por env — a UI usa isso para esconder a oferta. */
export function isBillingEnabled(): boolean {
  return (process.env.BILLING_ENABLED ?? '').trim() === 'true';
}

/**
 * Comparação de strings em tempo constante que **não lança**.
 *
 * `timingSafeEqual` exige buffers do mesmo tamanho (joga `RangeError` caso
 * contrário), e é justamente o caso mais comum de secret errado. Comprimento
 * diferente já é "não confere": vaza só o tamanho, que não é segredo.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Aceita tanto `'YYYY-MM-DD HH:MM:SS'` (o que sai do SQLite) quanto ISO 8601
 * com `T`/`Z`. Sem timezone explícito o instante é tratado como **UTC**, que é
 * o que `datetime('now')` grava — interpretar como hora local deslocaria o fim
 * do período em até um dia dependendo de onde o server roda.
 */
function parseInstant(value: string): Date {
  const trimmed = value.trim();
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  return new Date(withZone);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formata um `Date` no formato de instante do SQLite, em UTC. */
export function toSqliteUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

/**
 * Converte um instante vindo do provedor (ISO 8601 com `T`/`Z`) para o formato
 * do banco. Gravar o ISO cru quebraria a comparação `expires_at > ?` — ver
 * invariante 1 no topo do arquivo. Entrada inválida vira `null` ("sem expiração
 * conhecida"), nunca `'Invalid Date'`.
 */
export function toSqliteUtcFromProvider(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = parseInstant(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toSqliteUtc(parsed);
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Soma um período de assinatura a um instante, em UTC, com **clamp de dia**:
 * 31/01 + 1 mês = 28/02 (não 03/03, que é o que `setUTCMonth` faria por
 * overflow), 29/02 + 1 ano = 28/02. Cobrar sempre no dia 31 quem assinou dia 31
 * é impossível; encurtar para o último dia do mês destino é a convenção usual e
 * nunca dá ao usuário menos do que ele pagou de forma perceptível.
 */
export function addInterval(fromIso: string, interval: PlanInterval): string {
  const from = parseInstant(fromIso);
  const year = from.getUTCFullYear() + (interval === 'yearly' ? 1 : 0);
  const monthIndex = from.getUTCMonth() + (interval === 'monthly' ? 1 : 0);

  // Normaliza dezembro + 1 mês para janeiro do ano seguinte antes do clamp.
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const day = Math.min(from.getUTCDate(), daysInUtcMonth(targetYear, targetMonth));

  return toSqliteUtc(
    new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        day,
        from.getUTCHours(),
        from.getUTCMinutes(),
        from.getUTCSeconds(),
      ),
    ),
  );
}

/**
 * Base de contagem do novo período: o **maior** entre agora e o fim do período
 * vigente. Renovar antes de vencer soma ao que resta (o usuário não perde dias);
 * renovar depois de vencer conta a partir de agora (não presenteia o período em
 * que ficou sem pagar).
 */
export function renewalBase(nowIso: string, currentPeriodEnd: string | null | undefined): string {
  if (!currentPeriodEnd) return nowIso;
  return parseInstant(currentPeriodEnd) > parseInstant(nowIso) ? currentPeriodEnd : nowIso;
}

/** Assinatura vale agora? `active` com período vencido NÃO vale. */
export function isSubscriptionActive(
  sub: { status: string; current_period_end: string | null } | null | undefined,
  nowIso: string,
): boolean {
  if (!sub || sub.status !== 'active' || !sub.current_period_end) return false;
  return parseInstant(sub.current_period_end) > parseInstant(nowIso);
}

/** Instante "agora" no formato do banco — ponto único de leitura do relógio. */
export function nowSqliteUtc(): string {
  return toSqliteUtc(new Date());
}

export interface PlanRow {
  id: number;
  code: string;
  name: string;
  description: string;
  price_cents: number;
  interval: PlanInterval;
  active: number;
}

export interface SubscriptionRow {
  id: number;
  plan_id: number;
  status: Subscription['status'];
  current_period_end: string | null;
  created_at: string;
}

export function toPlan(row: PlanRow): Plan {
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    description: String(row.description),
    price_cents: Number(row.price_cents),
    interval: row.interval,
    active: Number(row.active) === 1,
  };
}

/**
 * Plano por id **sem filtrar `active`**. Desativar um plano tira ele da vitrine
 * (`GET /api/plans`), mas quem já assinou continua tendo o plano resolvido na
 * leitura — senão a assinatura de um plano descontinuado apareceria sem nome.
 */
export async function getActivePlan(planId: number): Promise<PlanRow | null> {
  const res = await db.execute({ sql: 'SELECT * FROM plans WHERE id = ?', args: [planId] });
  return (res.rows[0] as unknown as PlanRow) ?? null;
}

export async function getSubscriptionRow(userId: number): Promise<SubscriptionRow | null> {
  const res = await db.execute({
    sql: 'SELECT * FROM subscriptions WHERE user_id = ?',
    args: [userId],
  });
  return (res.rows[0] as unknown as SubscriptionRow) ?? null;
}

export interface PixChargeRow {
  id: number;
  user_id: number;
  plan_id: number;
  abacate_charge_id: string;
  amount_cents: number;
  status: PixCharge['status'];
  br_code: string;
  br_code_base64: string;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: Number(row.id),
    plan_id: Number(row.plan_id),
    status: row.status,
    current_period_end: row.current_period_end ?? null,
    created_at: String(row.created_at),
  };
}

/**
 * Projeta a linha de cobrança na forma exposta pela API. O `user_id` e o
 * `abacate_charge_id` ficam de fora de propósito: o primeiro é redundante (a
 * rota já é do usuário logado) e o segundo é identificador do provedor, que só
 * o webhook precisa conhecer.
 */
export function toPixCharge(row: PixChargeRow): PixCharge {
  return {
    id: Number(row.id),
    plan_id: Number(row.plan_id),
    amount_cents: Number(row.amount_cents),
    status: row.status,
    br_code: String(row.br_code),
    br_code_base64: String(row.br_code_base64),
    expires_at: row.expires_at ?? null,
    created_at: String(row.created_at),
  };
}

/**
 * Cobrança PENDING mais recente do usuário que ainda não expirou.
 * `expires_at IS NULL` conta como "sem expiração conhecida" e por isso é
 * incluída — o provedor é a fonte da verdade sobre o prazo, e descartar uma
 * cobrança que talvez esteja válida faria o usuário pagar duas vezes.
 */
export async function getPendingCharge(
  userId: number,
  nowIso: string,
  planId?: number,
): Promise<PixChargeRow | null> {
  const res = await db.execute({
    sql: `SELECT * FROM pix_charges
          WHERE user_id = ? AND status = 'PENDING'
            AND (expires_at IS NULL OR expires_at > ?)
            ${planId === undefined ? '' : 'AND plan_id = ?'}
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
    args: planId === undefined ? [userId, nowIso] : [userId, nowIso, planId],
  });
  return (res.rows[0] as unknown as PixChargeRow) ?? null;
}

export interface ActivationResult {
  /** true só quando ESTA chamada mudou o estado (cobrança passou a PAID). */
  activated: boolean;
  /** Dono da cobrança, quando ela existe — vem de `pix_charges.user_id`. */
  userId: number | null;
}

/**
 * Marca a cobrança como paga e ativa a assinatura do dono dela. **Idempotente**:
 * chamada duas vezes (webhook + polling, ou reentrega do provedor) a segunda
 * responde `activated: false` e não soma período de novo.
 *
 * A ativação vale mesmo para cobrança expirada localmente ou de plano depois
 * desativado: o dinheiro entrou, recusar seria ficar com o pagamento sem
 * entregar o serviço.
 *
 * O dono é SEMPRE `pix_charges.user_id` — nunca `metadata.userId` do payload do
 * provedor, que é dado de fora e daria a quem forjasse um webhook a chance de
 * ativar a assinatura de outra pessoa.
 */
export async function markChargePaidAndActivate(
  abacateChargeId: string,
): Promise<ActivationResult> {
  const chargeRes = await db.execute({
    sql: 'SELECT user_id, plan_id, status FROM pix_charges WHERE abacate_charge_id = ?',
    args: [abacateChargeId],
  });
  const charge = chargeRes.rows[0] as unknown as
    | { user_id: number; plan_id: number; status: string }
    | undefined;

  if (!charge) return { activated: false, userId: null };

  const userId = Number(charge.user_id);
  if (charge.status === 'PAID') return { activated: false, userId };

  const plan = await getActivePlan(Number(charge.plan_id));
  if (!plan) return { activated: false, userId };

  const sub = await getSubscriptionRow(userId);
  const periodEnd = addInterval(
    renewalBase(nowSqliteUtc(), sub?.current_period_end ?? null),
    plan.interval,
  );

  // Batch 'write' = uma transação: ou a cobrança vira PAID e a assinatura fica
  // ativa, ou nada acontece. O `status <> 'PAID'` no UPDATE é a rede de
  // segurança contra duas chamadas concorrentes (webhook e polling ao mesmo
  // tempo) — a segunda não reaplica nada porque a linha já mudou.
  await db.batch(
    [
      {
        sql: `UPDATE pix_charges SET status = 'PAID', paid_at = datetime('now')
              WHERE abacate_charge_id = ? AND status <> 'PAID'`,
        args: [abacateChargeId],
      },
      {
        sql: `INSERT INTO subscriptions (user_id, plan_id, status, current_period_end)
              VALUES (?, ?, 'active', ?)
              ON CONFLICT(user_id) DO UPDATE SET
                plan_id = excluded.plan_id,
                status = 'active',
                current_period_end = excluded.current_period_end,
                updated_at = datetime('now')`,
        args: [userId, plan.id, periodEnd],
      },
    ],
    'write',
  );

  return { activated: true, userId };
}
