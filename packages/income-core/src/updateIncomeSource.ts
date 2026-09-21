import type { Db } from '@vetor-wallet/db';
import type { IncomeSource, IncomeSourceUpdate } from '@vetor-wallet/shared';

export interface UpdateIncomeSourceParams {
  db: Db;
  userId: number;
  id: string | number;
  changes: IncomeSourceUpdate;
}

/**
 * Edição parcial de uma fonte de renda (T-031). Devolve a linha atualizada, ou
 * `null` quando ela não é do usuário (ou não existe) — a rota traduz no 404.
 */
export async function updateIncomeSource(
  params: UpdateIncomeSourceParams
): Promise<IncomeSource | null> {
  const { db, userId, id, changes } = params;

  const existing = await db.execute({
    sql: 'SELECT id FROM income_sources WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  if (existing.rows.length === 0) return null;

  const fields: string[] = [];
  const args: (string | number)[] = [];
  if (changes.name !== undefined) {
    fields.push('name = ?');
    args.push(changes.name.trim());
  }
  if (changes.type !== undefined) {
    fields.push('type = ?');
    args.push(changes.type);
  }
  if (changes.amount !== undefined) {
    fields.push('amount = ?');
    args.push(changes.amount);
  }

  if (fields.length > 0) {
    args.push(id, userId);
    await db.execute({
      sql: `UPDATE income_sources SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      args,
    });
  }

  // O re-SELECT não depende só da checagem acima: ele carrega o `user_id` de
  // novo (T-051).
  const row = await db.execute({
    sql: 'SELECT * FROM income_sources WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return row.rows[0] as unknown as IncomeSource;
}
