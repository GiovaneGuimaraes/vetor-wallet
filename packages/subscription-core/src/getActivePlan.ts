import type { Query } from '@vetor-wallet/query';

import type { PlanRow } from './Plan';

export const getActivePlanText = 'SELECT * FROM plans WHERE id = $1';

/**
 * Plano por id **sem filtrar `active`**. Desativar um plano tira ele da vitrine
 * (`GET /api/plans`), mas quem já assinou continua tendo o plano resolvido na
 * leitura — senão a assinatura de um plano descontinuado apareceria sem nome.
 *
 * O nome mentiria se `active` fosse filtrado aqui; ele descreve o papel do
 * plano (o plano vigente da assinatura), não o valor da coluna. Quem precisa da
 * vitrine filtra na própria rota.
 *
 * `query` no lugar de `db` (T-114, passo 5 de
 * `docs/multi-agent/plano-migracao-aws.md`) — mesmo contrato nos dois backends
 * de `@vetor-wallet/query`.
 */
export const getActivePlan = async (args: {
  query: Query;
  planId: number;
}): Promise<PlanRow | null> => {
  const res = await args.query<PlanRow>({ text: getActivePlanText, values: [args.planId] });
  return res.rows[0] ?? null;
};
