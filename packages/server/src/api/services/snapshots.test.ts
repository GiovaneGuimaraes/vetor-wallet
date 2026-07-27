import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isBusinessDay,
  getBRTDate,
  resolveActiveTickers,
  saveSnapshot,
  getPreviousCloseSnapshots,
  catchUpIfNeeded,
} from './snapshots';

vi.mock('../../db', () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { db } from '../../db';
const mockExecute = vi.mocked(db.execute);

// ── isBusinessDay ─────────────────────────────────────────────────────────────

describe('isBusinessDay', () => {
  it('returns false for Saturday', () => {
    // 2024-01-06 is a Saturday — shift to BRT representation
    const sat = new Date('2024-01-06T15:00:00Z'); // noon BRT (UTC-3)
    expect(isBusinessDay(sat)).toBe(false);
  });

  it('returns false for Sunday', () => {
    const sun = new Date('2024-01-07T15:00:00Z');
    expect(isBusinessDay(sun)).toBe(false);
  });

  it('returns true for Monday', () => {
    const mon = new Date('2024-01-08T15:00:00Z');
    expect(isBusinessDay(mon)).toBe(true);
  });

  it('returns true for Friday', () => {
    const fri = new Date('2024-01-12T15:00:00Z');
    expect(isBusinessDay(fri)).toBe(true);
  });
});

// ── getBRTDate ────────────────────────────────────────────────────────────────

describe('getBRTDate', () => {
  it('returns a Date whose UTC hours match the BRT local hour', () => {
    // Freeze time at 21:15 UTC = 18:15 BRT
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-08T21:15:00Z'));

    const brt = getBRTDate();
    expect(brt.getUTCHours()).toBe(18);
    expect(brt.getUTCMinutes()).toBe(15);

    vi.useRealTimers();
  });
});

// ── resolveActiveTickers ──────────────────────────────────────────────────────

describe('resolveActiveTickers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns tickers with positive net position', async () => {
    mockExecute.mockResolvedValue({
      rows: [{ ticker: 'PETR4' }, { ticker: 'VALE3' }],
      rowsAffected: 0,
      lastInsertRowid: undefined,
    } as never);

    const tickers = await resolveActiveTickers();
    expect(tickers).toEqual(['PETR4', 'VALE3']);
  });

  it('returns an empty array when no active positions exist', async () => {
    mockExecute.mockResolvedValue({
      rows: [],
      rowsAffected: 0,
      lastInsertRowid: undefined,
    } as never);

    const tickers = await resolveActiveTickers();
    expect(tickers).toEqual([]);
  });

  it('queries with a HAVING clause to filter zero/negative positions', async () => {
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 0, lastInsertRowid: undefined } as never);

    await resolveActiveTickers();

    const call = mockExecute.mock.calls[0][0] as string;
    expect(call).toMatch(/HAVING/i);
  });
});

// ── saveSnapshot (deduplication) ──────────────────────────────────────────────

describe('saveSnapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses INSERT OR IGNORE to prevent duplicate snapshots', async () => {
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 0, lastInsertRowid: undefined } as never);

    await saveSnapshot('PETR4', 38.5);

    const call = mockExecute.mock.calls[0][0] as { sql: string };
    expect(call.sql).toMatch(/INSERT OR IGNORE/i);
  });

  it('returns false when the snapshot is a duplicate (rowsAffected === 0)', async () => {
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 0, lastInsertRowid: undefined } as never);

    const inserted = await saveSnapshot('PETR4', 38.5);
    expect(inserted).toBe(false);
  });

  it('returns true when the snapshot is new (rowsAffected === 1)', async () => {
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1, lastInsertRowid: BigInt(1) } as never);

    const inserted = await saveSnapshot('VALE3', 90.2);
    expect(inserted).toBe(true);
  });

  it('passes the ticker and price as query args', async () => {
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1, lastInsertRowid: BigInt(2) } as never);

    await saveSnapshot('ITUB4', 25.0);

    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.args).toEqual(['ITUB4', 25.0]);
  });
});

// ── catchUpIfNeeded (T-058a: chamado no boot do server) ───────────────────────

describe('catchUpIfNeeded', () => {
  const okResult = { rows: [], rowsAffected: 0, lastInsertRowid: undefined };

  beforeEach(() => {
    vi.clearAllMocks();
    // Só a data é falsa — os `setTimeout` do backoff do withRetry precisam
    // continuar reais, senão o retry ficaria pendurado para sempre.
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does nothing on a weekend', async () => {
    vi.setSystemTime(new Date('2024-01-06T23:00:00Z')); // sábado, 20h BRT
    await catchUpIfNeeded();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('does nothing before 18:15 BRT on a business day', async () => {
    vi.setSystemTime(new Date('2024-01-08T21:00:00Z')); // segunda, 18:00 BRT
    await catchUpIfNeeded();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  // A guarda de "já rodou hoje" é o que torna seguro chamar a cada boot.
  it('skips the job when a snapshot for today already exists', async () => {
    vi.setSystemTime(new Date('2024-01-08T22:00:00Z')); // segunda, 19h BRT
    mockExecute.mockResolvedValue({ ...okResult, rows: [{ cnt: 2 }] } as never);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await catchUpIfNeeded();

    expect(mockExecute).toHaveBeenCalledTimes(1); // só a contagem do dia
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Boot com a brapi indisponível: o job desiste depois dos retries e a
  // promise RESOLVE — o `catch` de index.ts é a segunda linha de defesa,
  // nada aqui pode derrubar o processo.
  it('resolves (never rejects) when brapi is unavailable', async () => {
    vi.setSystemTime(new Date('2024-01-08T22:00:00Z'));
    mockExecute
      .mockResolvedValueOnce({ ...okResult, rows: [{ cnt: 0 }] } as never)
      .mockResolvedValueOnce({ ...okResult, rows: [{ ticker: 'PETR4' }] } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND brapi.dev')),
    );

    await expect(catchUpIfNeeded()).resolves.toBeUndefined();

    // nenhuma escrita de snapshot aconteceu (só a contagem + os tickers ativos)
    expect(mockExecute).toHaveBeenCalledTimes(2);
  }, 20000);
});

// ── getPreviousCloseSnapshots (T-016) ─────────────────────────────────────────

describe('getPreviousCloseSnapshots', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an empty map without querying when no tickers are given', async () => {
    const map = await getPreviousCloseSnapshots([], '2024-01-10');
    expect(map).toEqual(new Map());
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('builds a ticker → price map from the query result', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        { ticker: 'PETR4', price: 32 },
        { ticker: 'VALE3', price: 80 },
      ],
      rowsAffected: 0,
      lastInsertRowid: undefined,
    } as never);

    const map = await getPreviousCloseSnapshots(['PETR4', 'VALE3'], '2024-01-10');

    expect(map.get('PETR4')).toBe(32);
    expect(map.get('VALE3')).toBe(80);
  });

  it('omits tickers with no snapshot before the given date', async () => {
    mockExecute.mockResolvedValue({
      rows: [{ ticker: 'PETR4', price: 32 }],
      rowsAffected: 0,
      lastInsertRowid: undefined,
    } as never);

    const map = await getPreviousCloseSnapshots(['PETR4', 'VALE3'], '2024-01-10');

    expect(map.has('PETR4')).toBe(true);
    expect(map.has('VALE3')).toBe(false);
  });

  it('filters strictly before the given date and passes tickers + date as args', async () => {
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 0, lastInsertRowid: undefined } as never);

    await getPreviousCloseSnapshots(['PETR4', 'VALE3'], '2024-01-10');

    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.sql).toMatch(/date\(captured_at\)\s*<\s*\?/i);
    expect(call.args).toEqual(['PETR4', 'VALE3', '2024-01-10', '2024-01-10']);
  });
});
