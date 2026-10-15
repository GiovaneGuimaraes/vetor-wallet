import type { Db } from '@vetor-wallet/db';
import type { Operation } from '@vetor-wallet/shared';

export interface ListOperationsParams {
  db: Db;
  userId: number;
}

/**
 * Todas as operações de UM usuário, da mais recente para a mais antiga.
 *
 * Sem nenhum filtro de carteira (T-050): com carteira única o escopo é o
 * usuário, e a lista é sempre o consolidado — inclusive sobre carteiras
 * legadas. É por isso que `?walletId=` da rota é ignorado em vez de virar
 * parâmetro aqui.
 */
export async function listOperations(params: ListOperationsParams): Promise<Operation[]> {
  const { db, userId } = params;
  const result = await db.execute({
    sql: 'SELECT * FROM operations WHERE user_id = ? ORDER BY date DESC, created_at DESC',
    args: [userId],
  });
  return result.rows as unknown as Operation[];
}
