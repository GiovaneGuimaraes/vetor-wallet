import type { Db } from '@vetor-wallet/db';
import type { IncomeEntry, IncomeEntryUpdate } from '@vetor-wallet/shared';

export interface UpdateIncomeEntryParams {
  db: Db;
  userId: number;
  id: string | number;
  changes: IncomeEntryUpdate;
}

/**
 * Edição parcial de um lançamento de renda (T-031). Devolve a linha atualizada,
 * ou `null` quando ela não é do usuário (ou não existe).
 *
 * Editar `date` pode **mover o lançamento para outro mês**: isso é permitido de
 * propósito, e quem tira o item da lista exibida é a visão mensal do cliente.
 */
export async function updateIncomeEntry(
  params: UpdateIncomeEntryParams
): Promise<IncomeEntry | null> {
  const { db, userId, id, changes } = params;

  const existing = await db.execute({
    sql: 'SELECT id FROM income_entries WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  if (existing.rows.length === 0) return null;

  const fields: string[] = [];
  const args: (string | number)[] = [];
  if (changes.description !== undefined) {
    fields.push('description = ?');
    args.push(changes.description.trim());
  }
  if (changes.amount !== undefined) {
    fields.push('amount = ?');
    args.push(changes.amount);
  }
  if (changes.date !== undefined) {
    fields.push('date = ?');
    args.push(changes.date);
  }

  if (fields.length > 0) {
    args.push(id, userId);
    await db.execute({
      sql: `UPDATE income_entries SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      args,
    });
  }

  const row = await db.execute({
    sql: 'SELECT * FROM income_entries WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return row.rows[0] as unknown as IncomeEntry;
}
