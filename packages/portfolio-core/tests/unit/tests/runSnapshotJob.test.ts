import { fetchQuotesStrict } from 'src/fetchQuotesStrict';
import { runSnapshotJob } from 'src/runSnapshotJob';
import { makeTestDb } from 'tests/unit/testDb';

// A brapi e o backoff real ficam fora: o caminho com retry de verdade já é
// exercido pelo teste "brapi indisponível" de `catchUpIfNeeded`.
jest.mock('src/fetchQuotesStrict', () => ({ fetchQuotesStrict: jest.fn() }));
jest.mock('src/withRetry', () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

const mockFetch = jest.mocked(fetchQuotesStrict);

describe('runSnapshotJob', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockFetch.mockReset();
  });

  it('sem tickers ativos: não chama a brapi nem grava nada', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);

    await runSnapshotJob({ db });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(console.log).toHaveBeenCalledWith('[snapshots] No active tickers — skipping job');
  });

  it('brapi falhou depois dos retries: loga e RESOLVE sem gravar', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ ticker: 'PETR4' }] }]);
    const erro = new Error('fora do ar');
    mockFetch.mockImplementation(async () => {
      throw erro;
    });

    await expect(runSnapshotJob({ db })).resolves.toBeUndefined();

    expect(calls).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(
      '[snapshots] Failed to fetch quotes after retries:',
      erro
    );
  });

  it('grava cada cotação recebida e conta salvos, duplicados e tickers sem cotação', async () => {
    const { db, calls } = makeTestDb([
      { rows: [{ ticker: 'PETR4' }, { ticker: 'VALE3' }, { ticker: 'ITUB4' }] },
      { rowsAffected: 1 }, // PETR4 novo
      { rowsAffected: 0 }, // VALE3 já existia hoje
    ]);
    mockFetch.mockResolvedValue(
      new Map([
        ['PETR4', 38.5],
        ['VALE3', 61],
      ])
    );

    await runSnapshotJob({ db });

    expect(mockFetch).toHaveBeenCalledWith(['PETR4', 'VALE3', 'ITUB4']);
    expect(calls.slice(1).map((c) => c.args)).toEqual([
      ['PETR4', 38.5],
      ['VALE3', 61],
    ]);
    expect(console.log).toHaveBeenCalledWith(
      '[snapshots] Job complete — 1 saved, 1 duplicate(s) skipped, 1 ticker(s) without quote'
    );
  });
});
