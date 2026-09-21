import type { Db } from '@vetor-wallet/db';
import type { FixedExpense } from '@vetor-wallet/shared';
import { normalizeCategory } from '@vetor-wallet/validation-core';

export interface CreateFixedExpenseParams {
  db: Db;
  userId: number;
  name: string;
  category?: string;
  amount: number;
}

/**
 * Grava uma despesa fixa e devolve a linha criada.
 *
 * `name` é gravado sem espaços nas pontas e a **categoria na forma canônica**
 * (T-028) — a normalização mora aqui, e não na rota, porque é regra do domínio:
 * duas despesas com "Alimentação" e "alimentacao" têm que cair no mesmo teto de
 * orçamento, venham de onde vierem.
 *
 * O re-SELECT é filtrado por `user_id` (T-059, simetria com o update — T-051).
 */
export async function createFixedExpense(params: CreateFixedExpenseParams): Promise<FixedExpense> {
  const { db, userId, name, category = '', amount } = params;

  const insert = await db.execute({
    sql: 'INSERT INTO fixed_expenses (user_id, name, category, amount) VALUES (?, ?, ?, ?)',
    args: [userId, name.trim(), normalizeCategory(category), amount],
  });

  const newId = insert.lastInsertRowid ?? 0;
  const row = await db.execute({
    sql: 'SELECT * FROM fixed_expenses WHERE id = ? AND user_id = ?',
    args: [Number(newId), userId],
  });
  return row.rows[0] as unknown as FixedExpense;
}
