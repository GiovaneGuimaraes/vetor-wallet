import type { Db } from '@vetor-wallet/db';
import type { Operation } from '@vetor-wallet/shared';

export interface ListOperationsChronologicalParams {
  db: Db;
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
  const { db, userId, until } = params;
  const result =
    until === undefined
      ? await db.execute({
          sql: 'SELECT * FROM operations WHERE user_id = ? ORDER BY date ASC, created_at ASC',
          args: [userId],
        })
      : await db.execute({
          sql: `SELECT * FROM operations
            WHERE user_id = ? AND date <= ?
            ORDER BY date ASC, created_at ASC`,
          args: [userId, until],
        });
  return result.rows as unknown as Operation[];
}
