import type { Query } from '@vetor-wallet/query';

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
 *
 * `query` no lugar de `db` (T-114, passo 5 de
 * `docs/multi-agent/plano-migracao-aws.md`) — placeholders `$1, $2, ...` em vez
 * de `?`.
 */
export const getPendingCharge = async (args: {
  query: Query;
  userId: number;
  nowIso: string;
  planId?: number;
}): Promise<PixChargeRow | null> => {
  const filterByPlan = args.planId !== undefined;
  const res = await args.query<PixChargeRow>({
    text: `SELECT * FROM pix_charges
          WHERE user_id = $1 AND status = 'PENDING'
            AND (expires_at IS NULL OR expires_at > $2)
            ${filterByPlan ? 'AND plan_id = $3' : ''}
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
    values: filterByPlan
      ? [args.userId, args.nowIso, args.planId as number]
      : [args.userId, args.nowIso],
  });
  return res.rows[0] ?? null;
};
