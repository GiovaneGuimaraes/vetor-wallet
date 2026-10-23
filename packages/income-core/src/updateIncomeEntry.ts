import type { Query } from '@vetor-wallet/query';
import type { IncomeEntry, IncomeEntryUpdate } from '@vetor-wallet/shared';

export interface UpdateIncomeEntryParams {
  query: Query;
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
 *
 * A checagem de existência e o `UPDATE` carregam os dois `user_id`: nem uma
 * corrida entre as duas consultas escreveria em linha alheia. Placeholders
 * montados em ordem, sem repetir índice (exigência do `createSqliteQuery`).
 */
export async function updateIncomeEntry(
  params: UpdateIncomeEntryParams
): Promise<IncomeEntry | null> {
  const { query, userId, id, changes } = params;

  const existing = await query({
    text: 'SELECT id FROM income_entries WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  if (existing.rows.length === 0) return null;

  const fields: string[] = [];
  const values: Array<string | number> = [];
  let paramIndex = 1;
  if (changes.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(changes.description.trim());
  }
  if (changes.amount !== undefined) {
    fields.push(`amount = $${paramIndex++}`);
    values.push(changes.amount);
  }
  if (changes.date !== undefined) {
    fields.push(`date = $${paramIndex++}`);
    values.push(changes.date);
  }

  if (fields.length > 0) {
    values.push(id, userId);
    await query({
      text: `UPDATE income_entries SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}`,
      values,
    });
  }

  const row = await query<IncomeEntry>({
    text: 'SELECT * FROM income_entries WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return row.rows[0];
}
