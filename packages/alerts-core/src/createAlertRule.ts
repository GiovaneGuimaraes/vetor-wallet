import type { Query } from '@vetor-wallet/query';
import type { AlertRule, AlertRuleType } from '@vetor-wallet/shared';

export interface CreateAlertRuleParams {
  query: Query;
  userId: number;
  /** Já normalizado em MAIÚSCULAS pelo chamador (mesmo padrão do `operations-core`). */
  ticker: string;
  type: AlertRuleType;
  threshold: number;
}

/**
 * Grava uma regra de alerta e devolve a linha criada.
 *
 * O re-SELECT é filtrado por `user_id` (T-065, simetria com operations/savings):
 * ler de volta só pelo `id` recém-criado funcionaria na prática, mas a regra do
 * app é que **toda** consulta carregue o usuário na cláusula.
 *
 * `RETURNING id` no lugar do `lastInsertRowid` do SQLite (T-114, passo 5 de
 * `docs/multi-agent/plano-migracao-aws.md`) — o mesmo formato nos dois backends
 * do `@vetor-wallet/query`.
 */
export async function createAlertRule(params: CreateAlertRuleParams): Promise<AlertRule> {
  const { query, userId, ticker, type, threshold } = params;

  const insert = await query<{ id: number }>({
    text: 'INSERT INTO alert_rules (ticker, type, threshold, user_id) VALUES ($1, $2, $3, $4) RETURNING id',
    values: [ticker, type, threshold, userId],
  });

  const newId = insert.rows[0]?.id ?? 0;
  const row = await query<AlertRule>({
    text: 'SELECT * FROM alert_rules WHERE id = $1 AND user_id = $2',
    values: [newId, userId],
  });
  return row.rows[0];
}
