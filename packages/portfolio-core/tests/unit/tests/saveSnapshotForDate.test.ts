import { saveSnapshotForDate } from 'src/saveSnapshotForDate';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('saveSnapshotForDate', () => {
  it('grava o fechamento às 18:00 da data pedida, com ON CONFLICT DO NOTHING', async () => {
    const { query, calls } = makeTestQuery([{ rowCount: 1 }]);

    expect(
      await saveSnapshotForDate({ query, ticker: 'PETR4', price: 38.5, isoDate: '2024-01-08' })
    ).toBe(true);
    expect(calls[0].text).toMatch(
      /INSERT INTO quote_snapshots \(ticker, price, captured_at\) VALUES \(\$1, \$2, \$3\) ON CONFLICT DO NOTHING/
    );
    expect(calls[0].values).toEqual(['PETR4', 38.5, '2024-01-08T18:00:00']);
  });

  it('devolve false quando o UNIQUE(ticker, date) descartou a linha', async () => {
    const { query } = makeTestQuery([{ rowCount: 0 }]);

    expect(
      await saveSnapshotForDate({ query, ticker: 'PETR4', price: 1, isoDate: '2024-01-08' })
    ).toBe(false);
  });
});
