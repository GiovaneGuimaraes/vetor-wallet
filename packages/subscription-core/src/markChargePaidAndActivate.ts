import type { Db } from '@vetor-wallet/db';

import { addInterval } from './addInterval';
import { getActivePlan } from './getActivePlan';
import { getSubscriptionRow } from './getSubscriptionRow';
import { nowSqliteUtc } from './nowSqliteUtc';
import { renewalBase } from './renewalBase';

export interface ActivationResult {
  /** true só quando ESTA chamada mudou o estado (cobrança passou a PAID). */
  activated: boolean;
  /** Dono da cobrança, quando ela existe — vem de `pix_charges.user_id`. */
  userId: number | null;
}

/**
 * Marca a cobrança como paga e ativa a assinatura do dono dela.
 *
 * **É a única porta de ativação do módulo.** Webhook, polling do front
 * (`GET /api/pix-charges/:id`) e a rota de simulação chamam esta mesma função —
 * assim a idempotência (não somar período duas vezes) mora num lugar só.
 * Chamada duas vezes, a segunda responde `activated: false`.
 *
 * A ativação vale mesmo para cobrança expirada localmente ou de plano depois
 * desativado: o dinheiro entrou, recusar seria ficar com o pagamento sem
 * entregar o serviço.
 *
 * O dono é SEMPRE `pix_charges.user_id` — nunca `metadata.userId` do payload do
 * provedor, que é dado de fora e daria a quem forjasse um webhook a chance de
 * ativar a assinatura de outra pessoa. Por isso a função recebe só o
 * `abacateChargeId` e vai buscar o dono no banco.
 */
export const markChargePaidAndActivate = async (args: {
  db: Db;
  abacateChargeId: string;
}): Promise<ActivationResult> => {
  const chargeRes = await args.db.execute({
    sql: 'SELECT user_id, plan_id, status FROM pix_charges WHERE abacate_charge_id = ?',
    args: [args.abacateChargeId],
  });
  const charge = chargeRes.rows[0] as unknown as
    { user_id: number; plan_id: number; status: string } | undefined;

  if (!charge) return { activated: false, userId: null };

  const userId = Number(charge.user_id);
  if (charge.status === 'PAID') return { activated: false, userId };

  const plan = await getActivePlan({ db: args.db, planId: Number(charge.plan_id) });
  if (!plan) return { activated: false, userId };

  const sub = await getSubscriptionRow({ db: args.db, userId });
  const periodEnd = addInterval(
    renewalBase(nowSqliteUtc(), sub?.current_period_end ?? null),
    plan.interval
  );

  // Batch 'write' = uma transação: ou a cobrança vira PAID e a assinatura fica
  // ativa, ou nada acontece. O `status <> 'PAID'` no UPDATE é a rede de
  // segurança contra duas chamadas concorrentes (webhook e polling ao mesmo
  // tempo) — a segunda não reaplica nada porque a linha já mudou.
  await args.db.batch(
    [
      {
        sql: `UPDATE pix_charges SET status = 'PAID', paid_at = datetime('now')
              WHERE abacate_charge_id = ? AND status <> 'PAID'`,
        args: [args.abacateChargeId],
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
    'write'
  );

  return { activated: true, userId };
};
