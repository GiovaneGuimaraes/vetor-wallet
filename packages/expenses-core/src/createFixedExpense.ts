import type { Query } from '@vetor-wallet/query';
import type { FixedExpense } from '@vetor-wallet/shared';
import { normalizeCategory } from '@vetor-wallet/validation-core';

export interface CreateFixedExpenseParams {
  query: Query;
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
 *
 * `RETURNING id` no lugar do `lastInsertRowid` do SQLite (T-114, passo 5 de
 * `docs/multi-agent/plano-migracao-aws.md`).
 */
export async function createFixedExpense(params: CreateFixedExpenseParams): Promise<FixedExpense> {
  const { query, userId, name, category = '', amount } = params;

  const insert = await query<{ id: number }>({
    text: 'INSERT INTO fixed_expenses (user_id, name, category, amount) VALUES ($1, $2, $3, $4) RETURNING id',
    values: [userId, name.trim(), normalizeCategory(category), amount],
  });

  const newId = insert.rows[0]?.id ?? 0;
  const row = await query<FixedExpense>({
    text: 'SELECT * FROM fixed_expenses WHERE id = $1 AND user_id = $2',
    values: [newId, userId],
  });
  return row.rows[0];
}
