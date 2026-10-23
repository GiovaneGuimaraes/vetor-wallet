import type { Query } from '@vetor-wallet/query';

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
 *
 * `query` no lugar de `db` (T-114, passo 5 de
 * `docs/multi-agent/plano-migracao-aws.md`). **O `db.batch([...], 'write')`
 * saiu** — `@vetor-wallet/query` não tem transação interativa por proxy (é
 * dívida conhecida, documentada no `CLAUDE.md` do package); o UPDATE e o
 * INSERT/UPSERT viram duas chamadas sequenciais de `query`, na MESMA ordem de
 * antes. A idempotência continua garantida pelos dois mecanismos que já
 * existiam: `status <> 'PAID'` no UPDATE e `ON CONFLICT(user_id) DO UPDATE` no
 * INSERT — nenhum dos dois dependia da transação para ser seguro contra uma
 * segunda chamada (webhook + polling concorrentes).
 */
export const markChargePaidAndActivate = async (args: {
  query: Query;
  abacateChargeId: string;
}): Promise<ActivationResult> => {
  const chargeRes = await args.query<{ user_id: number; plan_id: number; status: string }>({
    text: 'SELECT user_id, plan_id, status FROM pix_charges WHERE abacate_charge_id = $1',
    values: [args.abacateChargeId],
  });
  const charge = chargeRes.rows[0];

  if (!charge) return { activated: false, userId: null };

  const userId = Number(charge.user_id);
  if (charge.status === 'PAID') return { activated: false, userId };

  const plan = await getActivePlan({ query: args.query, planId: Number(charge.plan_id) });
  if (!plan) return { activated: false, userId };

  const sub = await getSubscriptionRow({ query: args.query, userId });
  const periodEnd = addInterval(
    renewalBase(nowSqliteUtc(), sub?.current_period_end ?? null),
    plan.interval
  );

  // Duas chamadas sequenciais na MESMA ordem do `db.batch` de antes: ou a
  // cobrança vira PAID, ou nada muda (o UPDATE é um no-op por causa do
  // `status <> 'PAID'`). O `ON CONFLICT` do INSERT é o que torna o segundo
  // passo seguro mesmo sem transação.
  await args.query({
    text: `UPDATE pix_charges SET status = 'PAID', paid_at = datetime('now')
          WHERE abacate_charge_id = $1 AND status <> 'PAID'`,
    values: [args.abacateChargeId],
  });
  await args.query({
    text: `INSERT INTO subscriptions (user_id, plan_id, status, current_period_end)
          VALUES ($1, $2, 'active', $3)
          ON CONFLICT(user_id) DO UPDATE SET
            plan_id = excluded.plan_id,
            status = 'active',
            current_period_end = excluded.current_period_end,
            updated_at = datetime('now')`,
    values: [userId, plan.id, periodEnd],
  });

  return { activated: true, userId };
};
