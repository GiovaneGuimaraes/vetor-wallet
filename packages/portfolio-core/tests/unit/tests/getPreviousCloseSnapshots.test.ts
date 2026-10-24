import { getPreviousCloseSnapshots } from 'src/getPreviousCloseSnapshots';
import { makeMockQuery } from 'tests/unit/mockQuery';

// Portado do Vitest (snapshots.test.ts, T-016) na T-104, fatia 2/2 —
// assertivas intactas; o `vi.mock` do singleton virou o client injetado (`query` desde a T-114).
describe('getPreviousCloseSnapshots', () => {
  let { query, mockQuery } = makeMockQuery();
  beforeEach(() => ({ query, mockQuery } = makeMockQuery()));

  it('returns an empty map without querying when no tickers are given', async () => {
    const map = await getPreviousCloseSnapshots({
      query,
      tickers: [],
      beforeDateISO: '2024-01-10',
    });
    expect(map).toEqual(new Map());
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('builds a ticker → price map from the query result', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { ticker: 'PETR4', price: 32 },
        { ticker: 'VALE3', price: 80 },
      ],
      rowCount: 0,
    } as never);

    const map = await getPreviousCloseSnapshots({
      query,
      tickers: ['PETR4', 'VALE3'],
      beforeDateISO: '2024-01-10',
    });

    expect(map.get('PETR4')).toBe(32);
    expect(map.get('VALE3')).toBe(80);
  });

  it('omits tickers with no snapshot before the given date', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ ticker: 'PETR4', price: 32 }],
      rowCount: 0,
    } as never);

    const map = await getPreviousCloseSnapshots({
      query,
      tickers: ['PETR4', 'VALE3'],
      beforeDateISO: '2024-01-10',
    });

    expect(map.has('PETR4')).toBe(true);
    expect(map.has('VALE3')).toBe(false);
  });

  it('filters strictly before the given date and passes tickers + date as args', async () => {
    mockQuery.mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as never);

    await getPreviousCloseSnapshots({
      query,
      tickers: ['PETR4', 'VALE3'],
      beforeDateISO: '2024-01-10',
    });

    const call = mockQuery.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(call.text).toMatch(/date\(captured_at\)\s*<\s*\$3/i);
    // Placeholders sem repetição: o adaptador SQLite traduz por ORDEM.
    expect(call.text).toContain('ticker IN ($1,$2)');
    expect(call.text).toMatch(/date\(qs2\.captured_at\)\s*<\s*\$4/i);
    expect(call.values).toEqual(['PETR4', 'VALE3', '2024-01-10', '2024-01-10']);
  });
});
