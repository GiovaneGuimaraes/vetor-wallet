import { fetchQuotes } from '@vetor-wallet/brapi-core';
import { buildPortfolioSummary, buildPositionMap } from '@vetor-wallet/portfolio-core';
import { getPortfolioReturnAndEarliestDate } from 'src/getPortfolioReturnAndEarliestDate';
import { makeTestQuery } from 'tests/unit/testQuery';

jest.mock('@vetor-wallet/brapi-core', () => ({ fetchQuotes: jest.fn() }));
jest.mock('@vetor-wallet/portfolio-core', () => ({
  buildPositionMap: jest.fn(),
  buildPortfolioSummary: jest.fn(),
}));

const op = (ticker: string, date: string) => ({ ticker, date });

describe('getPortfolioReturnAndEarliestDate', () => {
  it('lê as operações do usuário e calcula o retorno com as cotações das posições abertas', async () => {
    const { query, calls } = makeTestQuery([
      { rows: [op('PETR4', '2026-01-02'), op('VALE3', '2026-01-03')] },
    ]);
    const positionMap = new Map([
      ['PETR4', { quantity: 10 }],
      ['VALE3', { quantity: 0 }],
    ]);
    const quotes = new Map();
    (buildPositionMap as jest.Mock).mockReturnValue(positionMap);
    (fetchQuotes as jest.Mock).mockResolvedValue({ quotes });
    (buildPortfolioSummary as jest.Mock).mockReturnValue({ totalProfitLossPct: 20 });

    const out = await getPortfolioReturnAndEarliestDate({ query, userId: 7 });

    expect(calls[0].text).toContain('WHERE user_id = $1 ORDER BY date ASC, created_at ASC');
    expect(calls[0].values).toEqual([7]);
    expect(fetchQuotes).toHaveBeenCalledWith(['PETR4']);
    expect(buildPortfolioSummary).toHaveBeenCalledWith(positionMap, quotes);
    expect(out).toEqual({ pct: 20, earliestDate: '2026-01-02' });
  });

  it('sem operações devolve nulos e não busca cotação', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await getPortfolioReturnAndEarliestDate({ query, userId: 7 })).toEqual({
      pct: null,
      earliestDate: null,
    });
    expect(fetchQuotes).not.toHaveBeenCalled();
  });

  it('qualquer falha vira nulos', async () => {
    const query = jest.fn(async () => {
      throw new Error('db down');
    }) as never;
    expect(await getPortfolioReturnAndEarliestDate({ query, userId: 7 })).toEqual({
      pct: null,
      earliestDate: null,
    });
  });
});
