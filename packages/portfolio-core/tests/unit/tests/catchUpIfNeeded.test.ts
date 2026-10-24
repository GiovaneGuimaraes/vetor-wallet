import { catchUpIfNeeded } from 'src/catchUpIfNeeded';
import { makeMockQuery } from 'tests/unit/mockQuery';

// Só a data é falsa — os `setTimeout` do backoff do withRetry precisam
// continuar reais, senão o retry ficaria pendurado para sempre. (Equivalente
// Jest do `vi.useFakeTimers({ toFake: ['Date'] })` do teste Vitest original.)
const ONLY_FAKE_DATE = {
  doNotFake: [
    'hrtime',
    'nextTick',
    'performance',
    'queueMicrotask',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'requestIdleCallback',
    'cancelIdleCallback',
    'setImmediate',
    'clearImmediate',
    'setInterval',
    'clearInterval',
    'setTimeout',
    'clearTimeout',
  ],
} as const;

// ── catchUpIfNeeded (T-058a: chamado no boot do server) ───────────────────────
// Portado do Vitest (snapshots.test.ts) na T-104, fatia 2/2 — assertivas
// intactas; o `vi.mock` do singleton virou o client injetado (`query` desde a T-114) e o
// `vi.stubGlobal('fetch')` virou `jest.spyOn(global, 'fetch')`.
describe('catchUpIfNeeded', () => {
  const okResult = { rows: [], rowCount: 0 };
  let { query, mockQuery } = makeMockQuery();

  beforeEach(() => {
    ({ query, mockQuery } = makeMockQuery());
    jest.useFakeTimers({ doNotFake: [...ONLY_FAKE_DATE.doNotFake] });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does nothing on a weekend', async () => {
    jest.setSystemTime(new Date('2024-01-06T23:00:00Z')); // sábado, 20h BRT
    await catchUpIfNeeded({ query });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does nothing before 18:15 BRT on a business day', async () => {
    jest.setSystemTime(new Date('2024-01-08T21:00:00Z')); // segunda, 18:00 BRT
    await catchUpIfNeeded({ query });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // A guarda de "já rodou hoje" é o que torna seguro chamar a cada boot.
  it('skips the job when a snapshot for today already exists', async () => {
    jest.setSystemTime(new Date('2024-01-08T22:00:00Z')); // segunda, 19h BRT
    mockQuery.mockResolvedValue({ ...okResult, rows: [{ cnt: 2 }] } as never);
    const fetchSpy = jest.spyOn(global, 'fetch');

    await catchUpIfNeeded({ query });

    expect(mockQuery).toHaveBeenCalledTimes(1); // só a contagem do dia
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Boot com a brapi indisponível: o job desiste depois dos retries e a
  // promise RESOLVE — o `catch` de index.ts é a segunda linha de defesa,
  // nada aqui pode derrubar o processo.
  it('resolves (never rejects) when brapi is unavailable', async () => {
    jest.setSystemTime(new Date('2024-01-08T22:00:00Z'));
    mockQuery
      .mockResolvedValueOnce({ ...okResult, rows: [{ cnt: 0 }] } as never)
      .mockResolvedValueOnce({ ...okResult, rows: [{ ticker: 'PETR4' }] } as never);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND brapi.dev'));

    await expect(catchUpIfNeeded({ query })).resolves.toBeUndefined();

    // nenhuma escrita de snapshot aconteceu (só a contagem + os tickers ativos)
    expect(mockQuery).toHaveBeenCalledTimes(2);
  }, 20000);

  // ── Testes novos da fatia 2/2: as bordas da guarda de horário ──

  it('does nothing in the morning of a business day (hora < 18)', async () => {
    jest.setSystemTime(new Date('2024-01-08T13:00:00Z')); // segunda, 10h BRT
    await catchUpIfNeeded({ query });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('18:14 BRT ainda não conta; 18:15 BRT já consulta o dia (UTC)', async () => {
    mockQuery.mockResolvedValue({ ...okResult, rows: [{ cnt: 1 }] } as never);

    jest.setSystemTime(new Date('2024-01-08T21:14:59Z'));
    await catchUpIfNeeded({ query });
    expect(mockQuery).not.toHaveBeenCalled();

    jest.setSystemTime(new Date('2024-01-08T21:15:00Z'));
    await catchUpIfNeeded({ query });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const call = mockQuery.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(call.text).toContain('date(captured_at) = $1');
    expect(call.values).toEqual(['2024-01-08']);
  });
});
