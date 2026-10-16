import { catchUpIfNeeded } from 'src/catchUpIfNeeded';
import { makeMockDb } from 'tests/unit/mockDb';

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
// intactas; o `vi.mock` do singleton virou o `db` injetado e o
// `vi.stubGlobal('fetch')` virou `jest.spyOn(global, 'fetch')`.
describe('catchUpIfNeeded', () => {
  const okResult = { rows: [], rowsAffected: 0, lastInsertRowid: undefined };
  let { db, mockExecute } = makeMockDb();

  beforeEach(() => {
    ({ db, mockExecute } = makeMockDb());
    jest.useFakeTimers({ doNotFake: [...ONLY_FAKE_DATE.doNotFake] });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does nothing on a weekend', async () => {
    jest.setSystemTime(new Date('2024-01-06T23:00:00Z')); // sábado, 20h BRT
    await catchUpIfNeeded({ db });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('does nothing before 18:15 BRT on a business day', async () => {
    jest.setSystemTime(new Date('2024-01-08T21:00:00Z')); // segunda, 18:00 BRT
    await catchUpIfNeeded({ db });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  // A guarda de "já rodou hoje" é o que torna seguro chamar a cada boot.
  it('skips the job when a snapshot for today already exists', async () => {
    jest.setSystemTime(new Date('2024-01-08T22:00:00Z')); // segunda, 19h BRT
    mockExecute.mockResolvedValue({ ...okResult, rows: [{ cnt: 2 }] } as never);
    const fetchSpy = jest.spyOn(global, 'fetch');

    await catchUpIfNeeded({ db });

    expect(mockExecute).toHaveBeenCalledTimes(1); // só a contagem do dia
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Boot com a brapi indisponível: o job desiste depois dos retries e a
  // promise RESOLVE — o `catch` de index.ts é a segunda linha de defesa,
  // nada aqui pode derrubar o processo.
  it('resolves (never rejects) when brapi is unavailable', async () => {
    jest.setSystemTime(new Date('2024-01-08T22:00:00Z'));
    mockExecute
      .mockResolvedValueOnce({ ...okResult, rows: [{ cnt: 0 }] } as never)
      .mockResolvedValueOnce({ ...okResult, rows: [{ ticker: 'PETR4' }] } as never);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND brapi.dev'));

    await expect(catchUpIfNeeded({ db })).resolves.toBeUndefined();

    // nenhuma escrita de snapshot aconteceu (só a contagem + os tickers ativos)
    expect(mockExecute).toHaveBeenCalledTimes(2);
  }, 20000);

  // ── Testes novos da fatia 2/2: as bordas da guarda de horário ──

  it('does nothing in the morning of a business day (hora < 18)', async () => {
    jest.setSystemTime(new Date('2024-01-08T13:00:00Z')); // segunda, 10h BRT
    await catchUpIfNeeded({ db });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('18:14 BRT ainda não conta; 18:15 BRT já consulta o dia (UTC)', async () => {
    mockExecute.mockResolvedValue({ ...okResult, rows: [{ cnt: 1 }] } as never);

    jest.setSystemTime(new Date('2024-01-08T21:14:59Z'));
    await catchUpIfNeeded({ db });
    expect(mockExecute).not.toHaveBeenCalled();

    jest.setSystemTime(new Date('2024-01-08T21:15:00Z'));
    await catchUpIfNeeded({ db });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.sql).toContain('date(captured_at) = ?');
    expect(call.args).toEqual(['2024-01-08']);
  });
});
