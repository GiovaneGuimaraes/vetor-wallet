import type { Db } from '@vetor-wallet/db';
import type { Operation } from '@vetor-wallet/shared';

export interface ListOperationsByTickerParams {
  db: Db;
  userId: number;
  /** Já normalizado em MAIÚSCULAS pelo chamador. */
  ticker: string;
}

/**
 * As operações de um ticker, em ordem CRONOLÓGICA (`date ASC`, desempate por
 * `created_at ASC`).
 *
 * A ordem é contrato, não detalhe: quem consome isto monta a posição com
 * `applyOperation`/`buildPositionMap` (`@vetor-wallet/portfolio-core`), e uma
 * SELL aplicada antes da BUY que a cobre distorceria o preço médio. É o oposto
 * da ordem de `listOperations`, que é de exibição.
 *
 * Sem filtro de carteira (T-050): a posição é o consolidado do usuário.
 */
export async function listOperationsByTicker(
  params: ListOperationsByTickerParams
): Promise<Operation[]> {
  const { db, userId, ticker } = params;
  const result = await db.execute({
    sql: 'SELECT * FROM operations WHERE ticker = ? AND user_id = ? ORDER BY date ASC, created_at ASC',
    args: [ticker, userId],
  });
  return result.rows as unknown as Operation[];
}
