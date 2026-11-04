import type { Query } from '@vetor-wallet/query';
import type { Operation } from '@vetor-wallet/shared';
import { buildPortfolioSummary } from './buildPortfolioSummary';
import { buildPositionMap } from './buildPositionMap';

export interface GetPortfolioReturnAndEarliestDateParams {
  query: Query;
  userId: number;
  /**
   * Cotações das posições abertas. Injetado (a rota passa o `fetchQuotes` do
   * `brapi-core`) para o `portfolio-core` não ganhar dependência de package
   * novo — mesmo molde do `query` (T-121).
   */
  fetchQuotes: (tickers: string[]) => Promise<{ quotes: Map<string, number> }>;
}

/**
 * Retorno percentual da carteira e data da primeira operação — o lado
 * "carteira" do `GET /api/benchmarks`. Morava no `insights-core` (T-099c) e veio
 * para cá na T-121: lê `operations` e usa a regra de preço médio, que são do
 * Portfolio; o Insights só compara com CDI/Ibovespa.
 *
 * Qualquer falha vira nulos (a rota responde sem o lado da carteira).
 */
export async function getPortfolioReturnAndEarliestDate(
  params: GetPortfolioReturnAndEarliestDateParams
): Promise<{
  pct: number | null;
  earliestDate: string | null;
}> {
  const { query, userId, fetchQuotes } = params;
  try {
    const result = await query<Operation>({
      text: 'SELECT * FROM operations WHERE user_id = $1 ORDER BY date ASC, created_at ASC',
      values: [userId],
    });
    const ops = result.rows;
    if (!ops.length) return { pct: null, earliestDate: null };

    const earliestDate = ops[0].date;
    const positionMap = buildPositionMap(ops);
    const activeTickers: string[] = [];
    for (const [ticker, pos] of positionMap.entries()) {
      if (pos.quantity > 0) activeTickers.push(ticker);
    }

    const { quotes } = await fetchQuotes(activeTickers);
    const summary = buildPortfolioSummary(positionMap, quotes);
    return { pct: summary.totalProfitLossPct, earliestDate };
  } catch {
    return { pct: null, earliestDate: null };
  }
}
