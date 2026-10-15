import type { Db } from '@vetor-wallet/db';
import type { AlertRule, AlertRuleType } from '@vetor-wallet/shared';

export interface CreateAlertRuleParams {
  db: Db;
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
 */
export async function createAlertRule(params: CreateAlertRuleParams): Promise<AlertRule> {
  const { db, userId, ticker, type, threshold } = params;

  const insert = await db.execute({
    sql: 'INSERT INTO alert_rules (ticker, type, threshold, user_id) VALUES (?, ?, ?, ?)',
    args: [ticker, type, threshold, userId],
  });

  const newId = insert.lastInsertRowid ?? 0;
  const row = await db.execute({
    sql: 'SELECT * FROM alert_rules WHERE id = ? AND user_id = ?',
    args: [Number(newId), userId],
  });
  return row.rows[0] as unknown as AlertRule;
}
