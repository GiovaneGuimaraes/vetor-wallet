import { listSnapshotPointsForWindow } from 'src/listSnapshotPointsForWindow';
import { makeTestDb } from 'tests/unit/testDb';

describe('listSnapshotPointsForWindow', () => {
  it('sem tickers não consulta nada (quote_snapshots não tem dono)', async () => {
    const { db, calls } = makeTestDb();

    expect(
      await listSnapshotPointsForWindow({
        db,
        tickers: [],
        windowStart: '2024-01-01',
        endDate: '2024-01-31',
      })
    ).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('janela com piso e teto inclusivos + base estritamente anterior ao início (T-063)', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }, { rows: [] }]);

    await listSnapshotPointsForWindow({
      db,
      tickers: ['PETR4', 'VALE3'],
      windowStart: '2024-01-01',
      endDate: '2024-01-31',
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain(
      'WHERE ticker IN (?,?) AND date(captured_at) >= ? AND date(captured_at) <= ?'
    );
    expect(calls[0].args).toEqual(['PETR4', 'VALE3', '2024-01-01', '2024-01-31']);
    // A base usa `<` estrito para não duplicar a linha que cai em windowStart.
    expect(calls[1].sql).toContain('MAX(date(captured_at)) AS max_date');
    expect(calls[1].sql).toContain('WHERE ticker IN (?,?) AND date(captured_at) < ?');
    expect(calls[1].args).toEqual(['PETR4', 'VALE3', '2024-01-01']);
  });

  it('devolve base primeiro, janela depois, já como SnapshotPoint', async () => {
    const { db } = makeTestDb([
      { rows: [{ ticker: 'PETR4', date: '2024-01-02', price: '11' }] },
      { rows: [{ ticker: 'PETR4', date: '2023-12-28', price: 10 }] },
    ]);

    expect(
      await listSnapshotPointsForWindow({
        db,
        tickers: ['PETR4'],
        windowStart: '2024-01-01',
        endDate: '2024-01-31',
      })
    ).toEqual([
      { ticker: 'PETR4', date: '2023-12-28', price: 10 },
      { ticker: 'PETR4', date: '2024-01-02', price: 11 },
    ]);
  });
});
