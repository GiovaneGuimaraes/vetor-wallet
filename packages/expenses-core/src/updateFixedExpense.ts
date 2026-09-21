import type { Db } from '@vetor-wallet/db';
import type { FixedExpense, FixedExpenseUpdate } from '@vetor-wallet/shared';
import { normalizeCategory } from '@vetor-wallet/validation-core';

export interface UpdateFixedExpenseParams {
  db: Db;
  userId: number;
  id: string | number;
  changes: FixedExpenseUpdate;
}

/**
 * Edição parcial de uma despesa fixa (T-031). Devolve a linha atualizada, ou
 * `null` quando ela não é do usuário (ou não existe) — a rota traduz esse
 * `null` no 404.
 *
 * Campo a campo: só o que veio em `changes` entra no `SET`. A categoria passa
 * pela **mesma normalização da criação** (T-028); um PATCH que escapasse dela
 * faria a despesa sumir do teto de orçamento em que estava.
 */
export async function updateFixedExpense(
  params: UpdateFixedExpenseParams
): Promise<FixedExpense | null> {
  const { db, userId, id, changes } = params;

  const existing = await db.execute({
    sql: 'SELECT id FROM fixed_expenses WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  if (existing.rows.length === 0) return null;

  const fields: string[] = [];
  const args: (string | number)[] = [];
  if (changes.name !== undefined) {
    fields.push('name = ?');
    args.push(changes.name.trim());
  }
  if (changes.category !== undefined) {
    fields.push('category = ?');
    args.push(normalizeCategory(changes.category));
  }
  if (changes.amount !== undefined) {
    fields.push('amount = ?');
    args.push(changes.amount);
  }

  if (fields.length > 0) {
    args.push(id, userId);
    await db.execute({
      sql: `UPDATE fixed_expenses SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      args,
    });
  }

  const row = await db.execute({
    sql: 'SELECT * FROM fixed_expenses WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return row.rows[0] as unknown as FixedExpense;
}
