import type { Query } from '@vetor-wallet/query';
import { fetchQuotes } from '@vetor-wallet/brapi-core';
import { buildPositionMap, buildPortfolioSummary } from '@vetor-wallet/portfolio-core';
import type { Operation } from '@vetor-wallet/shared';

export interface GetPortfolioReturnAndEarliestDateParams {
  query: Query;
  userId: number;
}

export async function getPortfolioReturnAndEarliestDate(
  params: GetPortfolioReturnAndEarliestDateParams
): Promise<{
  pct: number | null;
  earliestDate: string | null;
}> {
  const { query, userId } = params;
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
