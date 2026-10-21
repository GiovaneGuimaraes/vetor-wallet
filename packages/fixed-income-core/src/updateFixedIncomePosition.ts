import type { Query } from '@vetor-wallet/query';
import type { FixedIncomePosition, FixedIncomePositionUpdate } from '@vetor-wallet/shared';

export interface UpdateFixedIncomePositionParams {
  query: Query;
  userId: number;
  id: string | number;
  /** Já validado pela rota (campo a campo e as regras que cruzam campos). */
  changes: FixedIncomePositionUpdate;
}

/** Campo do corpo → coluna. A ordem aqui é a ordem do `SET`. */
const COLUMNS: Array<[keyof FixedIncomePositionUpdate, string]> = [
  ['name', 'name'],
  ['kind', 'kind'],
  ['institution', 'institution'],
  ['investedAmount', 'invested_amount'],
  ['investedAt', 'invested_at'],
  ['maturityDate', 'maturity_date'],
  ['rateType', 'rate_type'],
  ['rate', 'rate'],
  ['currentValue', 'current_value'],
  ['currentValueDate', 'current_value_date'],
  // Fatia d3a: ponteiro para o investimento da Pluggy que substitui esta
  // posição. `null` desfaz o vínculo; ausente não mexe (mesma regra dos outros).
  ['supersededByPluggyInvestmentId', 'superseded_by_pluggy_investment_id'],
];

/**
 * Edição parcial. Devolve a linha atualizada, ou `null` quando a posição não
 * existe ou é de outro usuário — a rota traduz esse `null` no 404.
 *
 * Só o que veio em `changes` (`!== undefined`) entra no `SET`; `null` entra,
 * e é como se limpa o vencimento ou o saldo informado. `changes` vazio não
 * emite `UPDATE` e devolve a linha intocada (a rota já recusa corpo vazio).
 *
 * A checagem de existência e o `UPDATE` carregam os dois `user_id`: nem uma
 * corrida entre as duas consultas escreveria em linha alheia. Placeholders
 * montados em ordem, sem repetir índice (exigência do `createSqliteQuery`).
 */
export async function updateFixedIncomePosition(
  params: UpdateFixedIncomePositionParams
): Promise<FixedIncomePosition | null> {
  const { query, userId, id, changes } = params;

  const existing = await query({
    text: 'SELECT id FROM fixed_income_positions WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  if (existing.rows.length === 0) return null;

  const fields: string[] = [];
  const values: Array<string | number | null> = [];
  let paramIndex = 1;
  for (const [key, column] of COLUMNS) {
    const value = changes[key];
    if (value === undefined) continue;
    fields.push(`${column} = $${paramIndex++}`);
    values.push(value);
  }

  if (fields.length > 0) {
    values.push(id, userId);
    await query({
      text: `UPDATE fixed_income_positions SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}`,
      values,
    });
  }

  const row = await query<FixedIncomePosition>({
    text: 'SELECT * FROM fixed_income_positions WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return row.rows[0] ?? null;
}
