import { getSnapshotHistory } from 'src/getSnapshotHistory';
import { makeTestDb } from 'tests/unit/testDb';

describe('getSnapshotHistory', () => {
  it('sem from/to: todo o histórico do ticker, em ordem cronológica', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);

    await getSnapshotHistory({ db, ticker: 'PETR4' });

    expect(calls[0].sql).toBe(
      'SELECT id, ticker, price, captured_at FROM quote_snapshots WHERE ticker = ? ORDER BY captured_at ASC'
    );
    expect(calls[0].args).toEqual(['PETR4']);
  });

  it('from e to viram piso e teto inclusivos sobre a DATA de captura', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);

    await getSnapshotHistory({ db, ticker: 'PETR4', from: '2024-01-01', to: '2024-01-31' });

    expect(calls[0].sql).toContain('AND date(captured_at) >= ? AND date(captured_at) <= ?');
    expect(calls[0].args).toEqual(['PETR4', '2024-01-01', '2024-01-31']);
  });

  it('só um dos limites entra sozinho', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }, { rows: [] }]);

    await getSnapshotHistory({ db, ticker: 'PETR4', from: '2024-01-01' });
    await getSnapshotHistory({ db, ticker: 'PETR4', to: '2024-01-31' });

    expect(calls[0].sql).not.toContain('<=');
    expect(calls[0].args).toEqual(['PETR4', '2024-01-01']);
    expect(calls[1].sql).not.toContain('>=');
    expect(calls[1].args).toEqual(['PETR4', '2024-01-31']);
  });

  it('converte as linhas para QuoteSnapshot (id e price numéricos)', async () => {
    const { db } = makeTestDb([
      {
        rows: [
          { id: BigInt(3), ticker: 'PETR4', price: '38.5', captured_at: '2024-01-08 21:15:00' },
        ],
      },
    ]);

    expect(await getSnapshotHistory({ db, ticker: 'PETR4' })).toEqual([
      { id: 3, ticker: 'PETR4', price: 38.5, captured_at: '2024-01-08 21:15:00' },
    ]);
  });
});
