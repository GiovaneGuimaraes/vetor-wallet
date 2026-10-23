import type { Query } from '@vetor-wallet/query';
import type { FixedExpense, FixedExpenseUpdate } from '@vetor-wallet/shared';
import { normalizeCategory } from '@vetor-wallet/validation-core';

export interface UpdateFixedExpenseParams {
  query: Query;
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
  const { query, userId, id, changes } = params;

  const existing = await query({
    text: 'SELECT id FROM fixed_expenses WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  if (existing.rows.length === 0) return null;

  const fields: string[] = [];
  const values: (string | number)[] = [];
  if (changes.name !== undefined) {
    values.push(changes.name.trim());
    fields.push(`name = $${values.length}`);
  }
  if (changes.category !== undefined) {
    values.push(normalizeCategory(changes.category));
    fields.push(`category = $${values.length}`);
  }
  if (changes.amount !== undefined) {
    values.push(changes.amount);
    fields.push(`amount = $${values.length}`);
  }

  if (fields.length > 0) {
    values.push(id, userId);
    await query({
      text: `UPDATE fixed_expenses SET ${fields.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
      values,
    });
  }

  const row = await query<FixedExpense>({
    text: 'SELECT * FROM fixed_expenses WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return row.rows[0];
}
