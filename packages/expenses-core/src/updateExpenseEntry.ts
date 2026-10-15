import type { Db } from '@vetor-wallet/db';
import type { ExpenseEntry, ExpenseEntryUpdate } from '@vetor-wallet/shared';
import { normalizeCategory } from '@vetor-wallet/validation-core';

export interface UpdateExpenseEntryParams {
  db: Db;
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
  const { db, userId, id, changes } = params;

  const existing = await db.execute({
    sql: 'SELECT id FROM expense_entries WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  if (existing.rows.length === 0) return null;

  const fields: string[] = [];
  const args: (string | number)[] = [];
  if (changes.description !== undefined) {
    fields.push('description = ?');
    args.push(changes.description.trim());
  }
  if (changes.category !== undefined) {
    fields.push('category = ?');
    args.push(normalizeCategory(changes.category));
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
      sql: `UPDATE expense_entries SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      args,
    });
  }

  // Re-SELECT também filtrado por user_id (T-051).
  const row = await db.execute({
    sql: 'SELECT * FROM expense_entries WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return row.rows[0] as unknown as ExpenseEntry;
}
