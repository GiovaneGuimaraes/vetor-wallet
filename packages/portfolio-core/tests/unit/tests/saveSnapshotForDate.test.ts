import { saveSnapshotForDate } from 'src/saveSnapshotForDate';
import { makeTestDb } from 'tests/unit/testDb';

describe('saveSnapshotForDate', () => {
  it('grava o fechamento às 18:00 da data pedida, com INSERT OR IGNORE', async () => {
    const { db, calls } = makeTestDb([{ rowsAffected: 1 }]);

    expect(
      await saveSnapshotForDate({ db, ticker: 'PETR4', price: 38.5, isoDate: '2024-01-08' })
    ).toBe(true);
    expect(calls[0].sql).toMatch(
      /INSERT OR IGNORE INTO quote_snapshots \(ticker, price, captured_at\)/
    );
    expect(calls[0].args).toEqual(['PETR4', 38.5, '2024-01-08T18:00:00']);
  });

  it('devolve false quando o UNIQUE(ticker, date) descartou a linha', async () => {
    const { db } = makeTestDb([{ rowsAffected: 0 }]);

    expect(
      await saveSnapshotForDate({ db, ticker: 'PETR4', price: 1, isoDate: '2024-01-08' })
    ).toBe(false);
  });
});
