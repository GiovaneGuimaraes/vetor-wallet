import { listSnapshotPointsForWindow } from 'src/listSnapshotPointsForWindow';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('listSnapshotPointsForWindow', () => {
  it('sem tickers não consulta nada (quote_snapshots não tem dono)', async () => {
    const { query, calls } = makeTestQuery();

    expect(
      await listSnapshotPointsForWindow({
        query,
        tickers: [],
        windowStart: '2024-01-01',
        endDate: '2024-01-31',
      })
    ).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('janela com piso e teto inclusivos + base estritamente anterior ao início (T-063)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, { rows: [] }]);

    await listSnapshotPointsForWindow({
      query,
      tickers: ['PETR4', 'VALE3'],
      windowStart: '2024-01-01',
      endDate: '2024-01-31',
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].text).toContain(
      'WHERE ticker IN ($1,$2) AND date(captured_at) >= $3 AND date(captured_at) <= $4'
    );
    expect(calls[0].values).toEqual(['PETR4', 'VALE3', '2024-01-01', '2024-01-31']);
    // A base usa `<` estrito para não duplicar a linha que cai em windowStart.
    expect(calls[1].text).toContain('MAX(date(captured_at)) AS max_date');
    expect(calls[1].text).toContain('WHERE ticker IN ($1,$2) AND date(captured_at) < $3');
    expect(calls[1].values).toEqual(['PETR4', 'VALE3', '2024-01-01']);
  });

  it('devolve base primeiro, janela depois, já como SnapshotPoint', async () => {
    const { query } = makeTestQuery([
      { rows: [{ ticker: 'PETR4', date: '2024-01-02', price: '11' }] },
      { rows: [{ ticker: 'PETR4', date: '2023-12-28', price: 10 }] },
    ]);

    expect(
      await listSnapshotPointsForWindow({
        query,
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
