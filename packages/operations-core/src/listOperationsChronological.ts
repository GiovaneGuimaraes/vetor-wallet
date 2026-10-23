import type { Query } from '@vetor-wallet/query';
import type { Operation } from '@vetor-wallet/shared';

export interface ListOperationsChronologicalParams {
  query: Query;
  userId: number;
  /** `YYYY-MM-DD`, inclusive. Ausente = todas as operações do usuário. */
  until?: string;
}

/**
 * Todas as operações de UM usuário em ordem CRONOLÓGICA (`date ASC`, desempate
 * por `created_at ASC`) — o que `GET /api/portfolio` e `/history` entregam a
 * `buildPositionMap`/`buildPortfolioHistory` (`@vetor-wallet/portfolio-core`).
 * Saiu daquela rota na T-104 (fatia 2/2 do `portfolio-core`).
 *
 * A ordem é contrato, como em `listOperationsByTicker`: uma SELL aplicada antes
 * da BUY que a cobre distorceria o preço médio. `until` é o teto do histórico
 * (o "hoje" BRT da janela); sem ele, nenhum filtro de data.
 *
 * Sem filtro de carteira (T-050): o escopo é o usuário.
 */
export async function listOperationsChronological(
  params: ListOperationsChronologicalParams
): Promise<Operation[]> {
  const { query, userId, until } = params;
  const result =
    until === undefined
      ? await query<Operation>({
          text: 'SELECT * FROM operations WHERE user_id = $1 ORDER BY date ASC, created_at ASC',
          values: [userId],
        })
      : await query<Operation>({
          text: `SELECT * FROM operations
            WHERE user_id = $1 AND date <= $2
            ORDER BY date ASC, created_at ASC`,
          values: [userId, until],
        });
  return result.rows;
}
