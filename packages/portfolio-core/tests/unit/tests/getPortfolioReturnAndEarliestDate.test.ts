import { getPortfolioReturnAndEarliestDate } from 'src/getPortfolioReturnAndEarliestDate';
import { makeTestQuery } from 'tests/unit/testQuery';

const op = (
  ticker: string,
  type: 'BUY' | 'SELL',
  quantity: number,
  price: number,
  date: string
) => ({
  ticker,
  type,
  quantity,
  price,
  date,
  fees: 0,
});

describe('getPortfolioReturnAndEarliestDate', () => {
  it('lê as operações do usuário e calcula o retorno com as cotações das posições abertas', async () => {
    const { query, calls } = makeTestQuery([
      {
        rows: [
          op('PETR4', 'BUY', 10, 10, '2026-01-02'),
          op('VALE3', 'BUY', 5, 10, '2026-01-03'),
          op('VALE3', 'SELL', 5, 12, '2026-01-04'),
        ],
      },
    ]);
    const fetchQuotes = jest.fn(async () => ({ quotes: new Map([['PETR4', 12]]) }));

    const out = await getPortfolioReturnAndEarliestDate({ query, userId: 7, fetchQuotes });

    expect(calls[0].text).toContain('WHERE user_id = $1 ORDER BY date ASC, created_at ASC');
    expect(calls[0].values).toEqual([7]);
    // só a posição aberta (VALE3 foi zerada) vai para a cotação
    expect(fetchQuotes).toHaveBeenCalledWith(['PETR4']);
    expect(out.earliestDate).toBe('2026-01-02');
    expect(out.pct).toBeCloseTo(20, 5);
  });

  it('sem operações devolve nulos e não busca cotação', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    const fetchQuotes = jest.fn();
    expect(await getPortfolioReturnAndEarliestDate({ query, userId: 7, fetchQuotes })).toEqual({
      pct: null,
      earliestDate: null,
    });
    expect(fetchQuotes).not.toHaveBeenCalled();
  });

  it('qualquer falha vira nulos', async () => {
    const query = jest.fn(async () => {
      throw new Error('db down');
    }) as never;
    expect(
      await getPortfolioReturnAndEarliestDate({ query, userId: 7, fetchQuotes: jest.fn() })
    ).toEqual({ pct: null, earliestDate: null });
  });
});
