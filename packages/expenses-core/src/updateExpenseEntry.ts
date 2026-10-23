import type { Query } from '@vetor-wallet/query';
import type { ExpenseEntry, ExpenseEntryUpdate } from '@vetor-wallet/shared';
import { normalizeCategory } from '@vetor-wallet/validation-core';

export interface UpdateExpenseEntryParams {
  query: Query;
  userId: number;
  id: string | number;
  changes: ExpenseEntryUpdate;
}

/**
 * Edição parcial de um lançamento de despesa variável (T-031). Devolve a linha
 * atualizada, ou `null` quando ela não é do usuário (ou não existe) — a rota
 * traduz esse `null` no 404.
 *
 * Campo a campo: só o que veio em `changes` entra no `SET`. A categoria passa
 * pela **mesma normalização da criação** (T-028); um PATCH que escapasse dela
 * faria a despesa sumir do teto de orçamento em que estava.
 *
 * Editar `date` pode **mover o lançamento para outro mês**: isso é permitido de
 * propósito, e quem tira o item da lista exibida é a visão mensal do cliente.
 *
 * `external_id` e `recurring_id` não são editáveis aqui — o primeiro é etiqueta
 * de procedência (T-084) e o segundo é o vínculo com o template da recorrência.
 */
export async function updateExpenseEntry(
  params: UpdateExpenseEntryParams
): Promise<ExpenseEntry | null> {
  const { query, userId, id, changes } = params;

  const existing = await query({
    text: 'SELECT id FROM expense_entries WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  if (existing.rows.length === 0) return null;

  const fields: string[] = [];
  const values: (string | number)[] = [];
  if (changes.description !== undefined) {
    values.push(changes.description.trim());
    fields.push(`description = $${values.length}`);
  }
  if (changes.category !== undefined) {
    values.push(normalizeCategory(changes.category));
    fields.push(`category = $${values.length}`);
  }
  if (changes.amount !== undefined) {
    values.push(changes.amount);
    fields.push(`amount = $${values.length}`);
  }
  if (changes.date !== undefined) {
    values.push(changes.date);
    fields.push(`date = $${values.length}`);
  }

  if (fields.length > 0) {
    values.push(id, userId);
    await query({
      text: `UPDATE expense_entries SET ${fields.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
      values,
    });
  }

  // Re-SELECT também filtrado por user_id (T-051).
  const row = await query<ExpenseEntry>({
    text: 'SELECT * FROM expense_entries WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return row.rows[0];
}
