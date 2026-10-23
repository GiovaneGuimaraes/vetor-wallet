import type { Query } from '@vetor-wallet/query';
import type { Operation } from '@vetor-wallet/shared';

export interface ListOperationsParams {
  query: Query;
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
  const { query, userId } = params;
  const result = await query<Operation>({
    text: 'SELECT * FROM operations WHERE user_id = $1 ORDER BY date DESC, created_at DESC',
    values: [userId],
  });
  return result.rows;
}
