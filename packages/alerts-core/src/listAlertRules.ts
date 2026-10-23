import type { Query } from '@vetor-wallet/query';
import type { AlertRule } from '@vetor-wallet/shared';

export interface ListAlertRulesParams {
  query: Query;
  userId: number;
}

/**
 * Todas as regras de alerta de UM usuário, da mais recente para a mais antiga.
 */
export async function listAlertRules(params: ListAlertRulesParams): Promise<AlertRule[]> {
  const { query, userId } = params;
  const result = await query<AlertRule>({
    text: 'SELECT * FROM alert_rules WHERE user_id = $1 ORDER BY created_at DESC',
    values: [userId],
  });
  return result.rows;
}
