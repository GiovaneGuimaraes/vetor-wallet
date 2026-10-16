import { getPreviousCloseSnapshots } from 'src/getPreviousCloseSnapshots';
import { makeMockDb } from 'tests/unit/mockDb';

// Portado do Vitest (snapshots.test.ts, T-016) na T-104, fatia 2/2 —
// assertivas intactas; o `vi.mock` do singleton virou o `db` injetado.
describe('getPreviousCloseSnapshots', () => {
  let { db, mockExecute } = makeMockDb();
  beforeEach(() => ({ db, mockExecute } = makeMockDb()));

  it('returns an empty map without querying when no tickers are given', async () => {
    const map = await getPreviousCloseSnapshots({ db, tickers: [], beforeDateISO: '2024-01-10' });
    expect(map).toEqual(new Map());
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('builds a ticker → price map from the query result', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        { ticker: 'PETR4', price: 32 },
        { ticker: 'VALE3', price: 80 },
      ],
      rowsAffected: 0,
      lastInsertRowid: undefined,
    } as never);

    const map = await getPreviousCloseSnapshots({
      db,
      tickers: ['PETR4', 'VALE3'],
      beforeDateISO: '2024-01-10',
    });

    expect(map.get('PETR4')).toBe(32);
    expect(map.get('VALE3')).toBe(80);
  });

  it('omits tickers with no snapshot before the given date', async () => {
    mockExecute.mockResolvedValue({
      rows: [{ ticker: 'PETR4', price: 32 }],
      rowsAffected: 0,
      lastInsertRowid: undefined,
    } as never);

    const map = await getPreviousCloseSnapshots({
      db,
      tickers: ['PETR4', 'VALE3'],
      beforeDateISO: '2024-01-10',
    });

    expect(map.has('PETR4')).toBe(true);
    expect(map.has('VALE3')).toBe(false);
  });

  it('filters strictly before the given date and passes tickers + date as args', async () => {
    mockExecute.mockResolvedValue({
      rows: [],
      rowsAffected: 0,
      lastInsertRowid: undefined,
    } as never);

    await getPreviousCloseSnapshots({
      db,
      tickers: ['PETR4', 'VALE3'],
      beforeDateISO: '2024-01-10',
    });

    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.sql).toMatch(/date\(captured_at\)\s*<\s*\?/i);
    expect(call.args).toEqual(['PETR4', 'VALE3', '2024-01-10', '2024-01-10']);
  });
});
