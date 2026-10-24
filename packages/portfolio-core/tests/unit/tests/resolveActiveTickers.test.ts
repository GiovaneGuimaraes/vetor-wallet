import { resolveActiveTickers } from 'src/resolveActiveTickers';
import { makeMockQuery } from 'tests/unit/mockQuery';

// Portado do Vitest (snapshots.test.ts) na T-104, fatia 2/2 — assertivas
// intactas; o `vi.mock` do singleton virou o client injetado (`query` desde a T-114).
describe('resolveActiveTickers', () => {
  let { query, mockQuery } = makeMockQuery();
  beforeEach(() => ({ query, mockQuery } = makeMockQuery()));

  it('returns tickers with positive net position', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ ticker: 'PETR4' }, { ticker: 'VALE3' }],
      rowCount: 0,
    } as never);

    const tickers = await resolveActiveTickers({ query });
    expect(tickers).toEqual(['PETR4', 'VALE3']);
  });

  it('returns an empty array when no active positions exist', async () => {
    mockQuery.mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as never);

    const tickers = await resolveActiveTickers({ query });
    expect(tickers).toEqual([]);
  });

  it('queries with a HAVING clause to filter zero/negative positions', async () => {
    mockQuery.mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as never);

    await resolveActiveTickers({ query });

    const call = mockQuery.mock.calls[0][0] as string;
    expect(call).toMatch(/HAVING/i);
  });
});
