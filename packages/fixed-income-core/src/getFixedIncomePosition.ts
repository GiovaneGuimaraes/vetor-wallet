import type { Query } from '@vetor-wallet/query';
import type { FixedIncomePosition } from '@vetor-wallet/shared';

export interface GetFixedIncomePositionParams {
  query: Query;
  userId: number;
  id: string | number;
}

/**
 * Uma posição do usuário, ou `null` se ela não existe **ou** é de outro
 * usuário — a rota traduz os dois no mesmo 404.
 *
 * Existe para o PATCH: a regra que cruza campos (`maturity_date >=
 * invested_at`) precisa do estado atual quando o corpo traz só um dos lados.
 */
export async function getFixedIncomePosition(
  params: GetFixedIncomePositionParams
): Promise<FixedIncomePosition | null> {
  const { query, userId, id } = params;
  const result = await query<FixedIncomePosition>({
    text: 'SELECT * FROM fixed_income_positions WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return result.rows[0] ?? null;
}
