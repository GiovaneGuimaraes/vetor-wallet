import type { Db } from '@vetor-wallet/db';
import type { SavingsEntry, SavingsEntryType } from '@vetor-wallet/shared';

export interface CreateSavingsEntryParams {
  db: Db;
  userId: number;
  type: SavingsEntryType;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  note?: string;
}

/**
 * Grava um lançamento e devolve a linha criada.
 *
 * O re-SELECT é filtrado por `user_id` (T-059, simetria com o update — T-051):
 * ler de volta só pelo `id` recém-criado funcionaria, mas abriria um caminho de
 * leitura sem dono, e a regra do app é que **toda** consulta de dado carregue o
 * usuário na cláusula.
 *
 * A coluna `goal_id` foi removida do banco na T-091b2 — não há mais nem onde
 * gravar o vínculo com meta.
 */
export async function createSavingsEntry(params: CreateSavingsEntryParams): Promise<SavingsEntry> {
  const { db, userId, type, amount, date, note = '' } = params;

  const insert = await db.execute({
    sql: 'INSERT INTO savings_entries (user_id, type, amount, date, note) VALUES (?, ?, ?, ?, ?)',
    args: [userId, type, amount, date, note ?? ''],
  });

  const newId = insert.lastInsertRowid ?? 0;
  const row = await db.execute({
    sql: 'SELECT * FROM savings_entries WHERE id = ? AND user_id = ?',
    args: [Number(newId), userId],
  });
  return row.rows[0] as unknown as SavingsEntry;
}
