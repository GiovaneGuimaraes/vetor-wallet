import type { Db } from '@vetor-wallet/db';

import type { PixChargeRow } from './PixCharge';

/**
 * Cobrança PENDING mais recente do usuário que ainda não expirou.
 *
 * `expires_at IS NULL` conta como "sem expiração conhecida" e por isso é
 * incluída — o provedor é a fonte da verdade sobre o prazo, e descartar uma
 * cobrança que talvez esteja válida faria o usuário pagar duas vezes.
 *
 * `planId` opcional: a assinatura filtra por plano (só reaproveita a cobrança
 * do MESMO plano), a leitura de estado (`GET /subscriptions/me`) não filtra.
 */
export const getPendingCharge = async (args: {
  db: Db;
  userId: number;
  nowIso: string;
  planId?: number;
}): Promise<PixChargeRow | null> => {
  const filterByPlan = args.planId !== undefined;
  const res = await args.db.execute({
    sql: `SELECT * FROM pix_charges
          WHERE user_id = ? AND status = 'PENDING'
            AND (expires_at IS NULL OR expires_at > ?)
            ${filterByPlan ? 'AND plan_id = ?' : ''}
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
    args: filterByPlan
      ? [args.userId, args.nowIso, args.planId as number]
      : [args.userId, args.nowIso],
  });
  return (res.rows[0] as unknown as PixChargeRow) ?? null;
};
