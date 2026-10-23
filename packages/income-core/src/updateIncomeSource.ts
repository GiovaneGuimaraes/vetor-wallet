import type { Query } from '@vetor-wallet/query';
import type { IncomeSource, IncomeSourceUpdate } from '@vetor-wallet/shared';

export interface UpdateIncomeSourceParams {
  query: Query;
  userId: number;
  id: string | number;
  changes: IncomeSourceUpdate;
}

/**
 * Edição parcial de uma fonte de renda (T-031). Devolve a linha atualizada, ou
 * `null` quando ela não é do usuário (ou não existe) — a rota traduz no 404.
 *
 * A checagem de existência e o `UPDATE` carregam os dois `user_id`: nem uma
 * corrida entre as duas consultas escreveria em linha alheia. Placeholders
 * montados em ordem, sem repetir índice (exigência do `createSqliteQuery`).
 */
export async function updateIncomeSource(
  params: UpdateIncomeSourceParams
): Promise<IncomeSource | null> {
  const { query, userId, id, changes } = params;

  const existing = await query({
    text: 'SELECT id FROM income_sources WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  if (existing.rows.length === 0) return null;

  const fields: string[] = [];
  const values: Array<string | number> = [];
  let paramIndex = 1;
  if (changes.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(changes.name.trim());
  }
  if (changes.type !== undefined) {
    fields.push(`type = $${paramIndex++}`);
    values.push(changes.type);
  }
  if (changes.amount !== undefined) {
    fields.push(`amount = $${paramIndex++}`);
    values.push(changes.amount);
  }

  if (fields.length > 0) {
    values.push(id, userId);
    await query({
      text: `UPDATE income_sources SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}`,
      values,
    });
  }

  // O re-SELECT não depende só da checagem acima: ele carrega o `user_id` de
  // novo (T-051).
  const row = await query<IncomeSource>({
    text: 'SELECT * FROM income_sources WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return row.rows[0];
}
