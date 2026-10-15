import type { Db } from '@vetor-wallet/db';
import type { AlertRule } from '@vetor-wallet/shared';

export interface ListAlertRulesParams {
  db: Db;
  userId: number;
}

/**
 * Todas as regras de alerta de UM usuário, da mais recente para a mais antiga.
 */
export async function listAlertRules(params: ListAlertRulesParams): Promise<AlertRule[]> {
  const { db, userId } = params;
  const result = await db.execute({
    sql: 'SELECT * FROM alert_rules WHERE user_id = ? ORDER BY created_at DESC',
    args: [userId],
  });
  return result.rows as unknown as AlertRule[];
}
