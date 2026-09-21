import type { Db } from '@vetor-wallet/db';
import type { IncomeSource } from '@vetor-wallet/shared';

export interface ListIncomeSourcesParams {
  db: Db;
  userId: number;
}

/** As fontes de renda fixas de UM usuário, da mais recente para a mais antiga. */
export async function listIncomeSources(params: ListIncomeSourcesParams): Promise<IncomeSource[]> {
  const { db, userId } = params;
  const result = await db.execute({
    sql: 'SELECT * FROM income_sources WHERE user_id = ? ORDER BY created_at DESC',
    args: [userId],
  });
  return result.rows as unknown as IncomeSource[];
}
