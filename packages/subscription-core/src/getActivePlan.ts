import type { Db } from '@vetor-wallet/db';

import type { PlanRow } from './Plan';

export const getActivePlanText = 'SELECT * FROM plans WHERE id = ?';

/**
 * Plano por id **sem filtrar `active`**. Desativar um plano tira ele da vitrine
 * (`GET /api/plans`), mas quem já assinou continua tendo o plano resolvido na
 * leitura — senão a assinatura de um plano descontinuado apareceria sem nome.
 *
 * O nome mentiria se `active` fosse filtrado aqui; ele descreve o papel do
 * plano (o plano vigente da assinatura), não o valor da coluna. Quem precisa da
 * vitrine filtra na própria rota.
 */
export const getActivePlan = async (args: {
  db: Db;
  planId: number;
}): Promise<PlanRow | null> => {
  const res = await args.db.execute({ sql: getActivePlanText, args: [args.planId] });
  return (res.rows[0] as unknown as PlanRow) ?? null;
};
