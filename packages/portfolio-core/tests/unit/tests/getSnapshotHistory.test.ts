import { getSnapshotHistory } from 'src/getSnapshotHistory';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('getSnapshotHistory', () => {
  it('sem from/to: todo o histórico do ticker, em ordem cronológica', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);

    await getSnapshotHistory({ query, ticker: 'PETR4' });

    expect(calls[0].text).toBe(
      'SELECT id, ticker, price, captured_at FROM quote_snapshots WHERE ticker = $1 ORDER BY captured_at ASC'
    );
    expect(calls[0].values).toEqual(['PETR4']);
  });

  it('from e to viram piso e teto inclusivos sobre a DATA de captura', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);

    await getSnapshotHistory({ query, ticker: 'PETR4', from: '2024-01-01', to: '2024-01-31' });

    expect(calls[0].text).toContain('AND date(captured_at) >= $2 AND date(captured_at) <= $3');
    expect(calls[0].values).toEqual(['PETR4', '2024-01-01', '2024-01-31']);
  });

  it('só um dos limites entra sozinho', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, { rows: [] }]);

    await getSnapshotHistory({ query, ticker: 'PETR4', from: '2024-01-01' });
    await getSnapshotHistory({ query, ticker: 'PETR4', to: '2024-01-31' });

    expect(calls[0].text).not.toContain('<=');
    expect(calls[0].text).toContain('date(captured_at) >= $2');
    expect(calls[0].values).toEqual(['PETR4', '2024-01-01']);
    expect(calls[1].text).not.toContain('>=');
    // Sem `from`, o teto é o 2º valor — o número segue a posição em `values`.
    expect(calls[1].text).toContain('date(captured_at) <= $2');
    expect(calls[1].values).toEqual(['PETR4', '2024-01-31']);
  });

  it('converte as linhas para QuoteSnapshot (id e price numéricos)', async () => {
    const { query } = makeTestQuery([
      {
        rows: [
          { id: BigInt(3), ticker: 'PETR4', price: '38.5', captured_at: '2024-01-08 21:15:00' },
        ],
      },
    ]);

    expect(await getSnapshotHistory({ query, ticker: 'PETR4' })).toEqual([
      { id: 3, ticker: 'PETR4', price: 38.5, captured_at: '2024-01-08 21:15:00' },
    ]);
  });
});
