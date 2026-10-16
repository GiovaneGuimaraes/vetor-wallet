import { resolveActiveTickers } from 'src/resolveActiveTickers';
import { makeMockDb } from 'tests/unit/mockDb';

// Portado do Vitest (snapshots.test.ts) na T-104, fatia 2/2 — assertivas
// intactas; o `vi.mock` do singleton virou o `db` injetado.
describe('resolveActiveTickers', () => {
  let { db, mockExecute } = makeMockDb();
  beforeEach(() => ({ db, mockExecute } = makeMockDb()));

  it('returns tickers with positive net position', async () => {
    mockExecute.mockResolvedValue({
      rows: [{ ticker: 'PETR4' }, { ticker: 'VALE3' }],
      rowsAffected: 0,
      lastInsertRowid: undefined,
    } as never);

    const tickers = await resolveActiveTickers({ db });
    expect(tickers).toEqual(['PETR4', 'VALE3']);
  });

  it('returns an empty array when no active positions exist', async () => {
    mockExecute.mockResolvedValue({
      rows: [],
      rowsAffected: 0,
      lastInsertRowid: undefined,
    } as never);

    const tickers = await resolveActiveTickers({ db });
    expect(tickers).toEqual([]);
  });

  it('queries with a HAVING clause to filter zero/negative positions', async () => {
    mockExecute.mockResolvedValue({
      rows: [],
      rowsAffected: 0,
      lastInsertRowid: undefined,
    } as never);

    await resolveActiveTickers({ db });

    const call = mockExecute.mock.calls[0][0] as string;
    expect(call).toMatch(/HAVING/i);
  });
});
