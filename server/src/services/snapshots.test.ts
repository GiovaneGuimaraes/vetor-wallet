import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isBusinessDay, getBRTDate, resolveActiveTickers, saveSnapshot } from './snapshots';

vi.mock('../db', () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { db } from '../db';
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
