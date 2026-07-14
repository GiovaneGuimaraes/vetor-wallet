import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveHourlyInsight, runHourlyInsightsJob, previousBusinessDay } from './hourlyInsights';

vi.mock('../db', () => ({
  db: { execute: vi.fn() },
}));

vi.mock('./snapshots', () => ({
  resolveActiveTickers: vi.fn(),
  getBRTDate: vi.fn(),
  saveSnapshot: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { db } from '../db';
import { resolveActiveTickers, getBRTDate, saveSnapshot } from './snapshots';

const mockExecute = vi.mocked(db.execute);
const mockResolveActiveTickers = vi.mocked(resolveActiveTickers);
const mockGetBRTDate = vi.mocked(getBRTDate);
const mockSaveSnapshot = vi.mocked(saveSnapshot);

// 2024-01-08 10:00 BRT = 2024-01-08 13:00 UTC → Unix 1704718800
const JAN08_10H_UTC = 1704718800;
// 2024-01-08 11:00 BRT = 2024-01-08 14:00 UTC → Unix 1704722400
const JAN08_11H_UTC = 1704722400;

function mockFetchWithCandles(candles: { date: number; close: number }[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: 'PETR4', historicalDataPrice: candles }],
      }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveSnapshot.mockResolvedValue(true);
});

// ── previousBusinessDay ───────────────────────────────────────────────────────

describe('previousBusinessDay', () => {
  it('returns yesterday when today is Tuesday BRT', () => {
    // Tuesday 2024-01-09 12:00 BRT = 2024-01-09 15:00 UTC
    mockGetBRTDate.mockReturnValue(new Date('2024-01-09T15:00:00Z'));
    expect(previousBusinessDay()).toBe('2024-01-08');
  });

  it('returns Friday when today is Monday BRT (yesterday was Sunday)', () => {
    // Monday 2024-01-08 12:00 BRT
    mockGetBRTDate.mockReturnValue(new Date('2024-01-08T15:00:00Z'));
    expect(previousBusinessDay()).toBe('2024-01-05');
  });

  it('returns Friday when today is Sunday BRT (yesterday was Saturday)', () => {
    // Sunday 2024-01-07 12:00 BRT
    mockGetBRTDate.mockReturnValue(new Date('2024-01-07T15:00:00Z'));
    expect(previousBusinessDay()).toBe('2024-01-05');
  });
});

// ── saveHourlyInsight ─────────────────────────────────────────────────────────

describe('saveHourlyInsight', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses INSERT OR IGNORE to prevent duplicate hourly insights', async () => {
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 0, lastInsertRowid: undefined } as never);

    await saveHourlyInsight('PETR4', '2024-01-08', 10, 35.5);

    const call = mockExecute.mock.calls[0][0] as { sql: string };
    expect(call.sql).toMatch(/INSERT OR IGNORE/i);
  });

  it('returns false when the insight is a duplicate (rowsAffected === 0)', async () => {
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 0, lastInsertRowid: undefined } as never);

    const inserted = await saveHourlyInsight('PETR4', '2024-01-08', 10, 35.5);
    expect(inserted).toBe(false);
  });

  it('returns true when the insight is new (rowsAffected === 1)', async () => {
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1, lastInsertRowid: BigInt(1) } as never);

    const inserted = await saveHourlyInsight('VALE3', '2024-01-08', 11, 90.2);
    expect(inserted).toBe(true);
  });

  it('passes ticker, quoteDate, hour and price as query args', async () => {
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1, lastInsertRowid: BigInt(2) } as never);

    await saveHourlyInsight('ITUB4', '2024-01-08', 14, 25.0);

    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.args).toEqual(['ITUB4', '2024-01-08', 14, 25.0]);
  });
});

// ── runHourlyInsightsJob ──────────────────────────────────────────────────────

describe('runHourlyInsightsJob', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns [] and logs when there are no active tickers', async () => {
    mockResolveActiveTickers.mockResolvedValue([]);

    const results = await runHourlyInsightsJob('2024-01-08');
    expect(results).toEqual([]);
  });

  it('processes a ticker and returns correct counts', async () => {
    mockResolveActiveTickers.mockResolvedValue(['PETR4']);
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1, lastInsertRowid: BigInt(1) } as never);
    mockFetchWithCandles([
      { date: JAN08_10H_UTC, close: 35.5 },
      { date: JAN08_11H_UTC, close: 36.0 },
    ]);

    const results = await runHourlyInsightsJob('2024-01-08');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ ticker: 'PETR4', processed: 2, saved: 2, duplicates: 0 });
  });

  it('counts duplicates when INSERT OR IGNORE discards a row', async () => {
    mockResolveActiveTickers.mockResolvedValue(['PETR4']);
    mockExecute
      .mockResolvedValueOnce({ rows: [], rowsAffected: 1, lastInsertRowid: BigInt(1) } as never)
      .mockResolvedValueOnce({ rows: [], rowsAffected: 0, lastInsertRowid: undefined } as never);
    mockFetchWithCandles([
      { date: JAN08_10H_UTC, close: 35.5 },
      { date: JAN08_11H_UTC, close: 36.0 },
    ]);

    const results = await runHourlyInsightsJob('2024-01-08');

    expect(results[0]).toMatchObject({ processed: 2, saved: 1, duplicates: 1 });
  });

  it('calls saveSnapshot with the last candle for bridging', async () => {
    mockResolveActiveTickers.mockResolvedValue(['PETR4']);
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1, lastInsertRowid: BigInt(1) } as never);
    mockFetchWithCandles([
      { date: JAN08_10H_UTC, close: 35.5 },
      { date: JAN08_11H_UTC, close: 36.0 },
    ]);

    await runHourlyInsightsJob('2024-01-08');

    expect(mockSaveSnapshot).toHaveBeenCalledWith('PETR4', 36.0);
  });

  it('continues processing remaining tickers when one fails', async () => {
    mockResolveActiveTickers.mockResolvedValue(['PETR4', 'VALE3']);
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1, lastInsertRowid: BigInt(1) } as never);

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ symbol: 'VALE3', historicalDataPrice: [{ date: JAN08_10H_UTC, close: 90.0 }] }],
          }),
        }),
    );

    const results = await runHourlyInsightsJob('2024-01-08');

    expect(results).toHaveLength(2);
    expect(results[0].ticker).toBe('PETR4');
    expect(results[0].error).toBeDefined();
    expect(results[1].ticker).toBe('VALE3');
    expect(results[1].error).toBeUndefined();
    expect(results[1].processed).toBe(1);
  });

  it('filters out candles that do not belong to targetDate', async () => {
    mockResolveActiveTickers.mockResolvedValue(['PETR4']);
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1, lastInsertRowid: BigInt(1) } as never);

    // This timestamp is 2024-01-07 13:00 UTC = 2024-01-07 10:00 BRT (different day)
    const JAN07_10H_UTC = 1704632400;
    mockFetchWithCandles([
      { date: JAN07_10H_UTC, close: 34.0 },  // wrong day
      { date: JAN08_10H_UTC, close: 35.5 },  // correct day
    ]);

    const results = await runHourlyInsightsJob('2024-01-08');

    expect(results[0].processed).toBe(1);
    expect(results[0].saved).toBe(1);
  });

  it('does not call saveSnapshot when no candles match targetDate', async () => {
    mockResolveActiveTickers.mockResolvedValue(['PETR4']);
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 0, lastInsertRowid: undefined } as never);

    const JAN07_10H_UTC = 1704632400; // 2024-01-07 BRT
    mockFetchWithCandles([{ date: JAN07_10H_UTC, close: 34.0 }]);

    await runHourlyInsightsJob('2024-01-08');

    expect(mockSaveSnapshot).not.toHaveBeenCalled();
  });

  it('uses previousBusinessDay when no targetDate is provided', async () => {
    // Tuesday 2024-01-09 12:00 BRT → previousBusinessDay = 2024-01-08
    mockGetBRTDate.mockReturnValue(new Date('2024-01-09T15:00:00Z'));
    mockResolveActiveTickers.mockResolvedValue(['PETR4']);
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1, lastInsertRowid: BigInt(1) } as never);
    mockFetchWithCandles([{ date: JAN08_10H_UTC, close: 35.5 }]);

    const results = await runHourlyInsightsJob();

    expect(results[0].processed).toBe(1);
    // Verify the insert used quoteDate = '2024-01-08'
    const insertCall = mockExecute.mock.calls[0][0] as { args: unknown[] };
    expect(insertCall.args[1]).toBe('2024-01-08');
  });
});
