import { saveSnapshot } from 'src/saveSnapshot';
import { makeMockDb } from 'tests/unit/mockDb';

// Portado do Vitest (snapshots.test.ts) na T-104, fatia 2/2 — assertivas
// intactas; o `vi.mock` do singleton virou o `db` injetado.
describe('saveSnapshot', () => {
  let { db, mockExecute } = makeMockDb();
  beforeEach(() => ({ db, mockExecute } = makeMockDb()));

  it('uses INSERT OR IGNORE to prevent duplicate snapshots', async () => {
    mockExecute.mockResolvedValue({
      rows: [],
      rowsAffected: 0,
      lastInsertRowid: undefined,
    } as never);

    await saveSnapshot({ db, ticker: 'PETR4', price: 38.5 });

    const call = mockExecute.mock.calls[0][0] as { sql: string };
    expect(call.sql).toMatch(/INSERT OR IGNORE/i);
  });

  it('returns false when the snapshot is a duplicate (rowsAffected === 0)', async () => {
    mockExecute.mockResolvedValue({
      rows: [],
      rowsAffected: 0,
      lastInsertRowid: undefined,
    } as never);

    const inserted = await saveSnapshot({ db, ticker: 'PETR4', price: 38.5 });
    expect(inserted).toBe(false);
  });

  it('returns true when the snapshot is new (rowsAffected === 1)', async () => {
    mockExecute.mockResolvedValue({
      rows: [],
      rowsAffected: 1,
      lastInsertRowid: BigInt(1),
    } as never);

    const inserted = await saveSnapshot({ db, ticker: 'VALE3', price: 90.2 });
    expect(inserted).toBe(true);
  });

  it('passes the ticker and price as query args', async () => {
    mockExecute.mockResolvedValue({
      rows: [],
      rowsAffected: 1,
      lastInsertRowid: BigInt(2),
    } as never);

    await saveSnapshot({ db, ticker: 'ITUB4', price: 25.0 });

    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.args).toEqual(['ITUB4', 25.0]);
  });
});
