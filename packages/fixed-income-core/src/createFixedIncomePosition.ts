import type { Query } from '@vetor-wallet/query';
import type { FixedIncomePosition, NewFixedIncomePosition } from '@vetor-wallet/shared';

export interface CreateFixedIncomePositionParams {
  query: Query;
  userId: number;
  /** Já validada pela rota — este core não revalida entrada de usuário. */
  position: NewFixedIncomePosition;
}

/**
 * Grava uma posição e devolve a linha criada.
 *
 * `RETURNING id` (convenção do `@vetor-wallet/query`, T-113) e re-SELECT
 * filtrado por `user_id`, como no `savings-core` (T-059): nenhum caminho de
 * leitura sem dono, nem o de ler de volta o que acabou de ser criado.
 *
 * Opcionais ausentes viram `''` (`institution`) ou `NULL` (vencimento e o par
 * saldo/data do saldo) — nunca `undefined`, que o driver não aceita.
 */
export async function createFixedIncomePosition(
  params: CreateFixedIncomePositionParams
): Promise<FixedIncomePosition> {
  const { query, userId, position } = params;

  const insert = await query<{ id: number }>({
    text:
      'INSERT INTO fixed_income_positions (user_id, name, kind, institution, invested_amount, ' +
      'invested_at, maturity_date, rate_type, rate, current_value, current_value_date) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id',
    values: [
      userId,
      position.name,
      position.kind,
      position.institution ?? '',
      position.investedAmount,
      position.investedAt,
      position.maturityDate ?? null,
      position.rateType,
      position.rate,
      position.currentValue ?? null,
      position.currentValueDate ?? null,
    ],
  });

  const newId = insert.rows[0]?.id ?? 0;
  const row = await query<FixedIncomePosition>({
    text: 'SELECT * FROM fixed_income_positions WHERE id = $1 AND user_id = $2',
    values: [newId, userId],
  });
  return row.rows[0];
}
