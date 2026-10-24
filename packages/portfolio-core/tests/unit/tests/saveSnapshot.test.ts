import { saveSnapshot } from 'src/saveSnapshot';
import { makeMockQuery } from 'tests/unit/mockQuery';

// Portado do Vitest (snapshots.test.ts) na T-104, fatia 2/2 — assertivas
// intactas; o `vi.mock` do singleton virou o client injetado (`query` desde a T-114).
describe('saveSnapshot', () => {
  let { query, mockQuery } = makeMockQuery();
  beforeEach(() => ({ query, mockQuery } = makeMockQuery()));

  // Era `INSERT OR IGNORE` até a T-114: `ON CONFLICT DO NOTHING` roda igual no
  // SQLite e no Postgres.
  it('uses ON CONFLICT DO NOTHING to prevent duplicate snapshots', async () => {
    mockQuery.mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as never);

    await saveSnapshot({ query, ticker: 'PETR4', price: 38.5 });

    const call = mockQuery.mock.calls[0][0] as { text: string };
    expect(call.text).toMatch(/ON CONFLICT DO NOTHING/i);
    expect(call.text).not.toMatch(/OR IGNORE/i);
  });

  it('returns false when the snapshot is a duplicate (rowCount === 0)', async () => {
    mockQuery.mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as never);

    const inserted = await saveSnapshot({ query, ticker: 'PETR4', price: 38.5 });
    expect(inserted).toBe(false);
  });

  it('returns true when the snapshot is new (rowCount === 1)', async () => {
    mockQuery.mockResolvedValue({
      rows: [],
      rowCount: 1,
    } as never);

    const inserted = await saveSnapshot({ query, ticker: 'VALE3', price: 90.2 });
    expect(inserted).toBe(true);
  });

  it('passes the ticker and price as query args', async () => {
    mockQuery.mockResolvedValue({
      rows: [],
      rowCount: 1,
    } as never);

    await saveSnapshot({ query, ticker: 'ITUB4', price: 25.0 });

    const call = mockQuery.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(call.values).toEqual(['ITUB4', 25.0]);
  });
});
