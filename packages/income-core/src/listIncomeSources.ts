import type { Query } from '@vetor-wallet/query';
import type { IncomeSource } from '@vetor-wallet/shared';

export interface ListIncomeSourcesParams {
  query: Query;
  userId: number;
}

/** As fontes de renda fixas de UM usuário, da mais recente para a mais antiga. */
export async function listIncomeSources(params: ListIncomeSourcesParams): Promise<IncomeSource[]> {
  const { query, userId } = params;
  const result = await query<IncomeSource>({
    text: 'SELECT * FROM income_sources WHERE user_id = $1 ORDER BY created_at DESC',
    values: [userId],
  });
  return result.rows;
}
