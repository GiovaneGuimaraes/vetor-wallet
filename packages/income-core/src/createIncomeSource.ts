import type { Db } from '@vetor-wallet/db';
import type { IncomeSource, IncomeSourceType } from '@vetor-wallet/shared';

export interface CreateIncomeSourceParams {
  db: Db;
  userId: number;
  name: string;
  type?: IncomeSourceType;
  amount: number;
}

/**
 * Grava uma fonte de renda fixa e devolve a linha criada.
 *
 * `type` ausente vira `'OUTRO'` — o default vem de quando a coluna nasceu e
 * está registrado como débito no `BACKLOG.md` ("default silencioso"): ele
 * aceita um corpo sem `type` em vez de recusar, e quem manda um tipo errado
 * recebe 400 da rota. Mantido aqui para a extração não mudar comportamento.
 *
 * O re-SELECT é filtrado por `user_id` (T-059, simetria com o update — T-051).
 */
export async function createIncomeSource(params: CreateIncomeSourceParams): Promise<IncomeSource> {
  const { db, userId, name, type = 'OUTRO', amount } = params;

  const insert = await db.execute({
    sql: 'INSERT INTO income_sources (user_id, name, type, amount) VALUES (?, ?, ?, ?)',
    args: [userId, name.trim(), type, amount],
  });

  const newId = insert.lastInsertRowid ?? 0;
  const row = await db.execute({
    sql: 'SELECT * FROM income_sources WHERE id = ? AND user_id = ?',
    args: [Number(newId), userId],
  });
  return row.rows[0] as unknown as IncomeSource;
}
