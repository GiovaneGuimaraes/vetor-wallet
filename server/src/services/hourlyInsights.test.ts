import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveHourlyInsight, runHourlyInsightsJob, yesterday } from './hourlyInsights';

vi.mock('../db', () => ({
  db: { execute: vi.fn() },
}));

vi.mock('./snapshots', () => ({
  resolveActiveTickers: vi.fn(),
  getBRTDate: vi.fn(),
  saveSnapshotForDate: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { db } from '../db';
import { resolveActiveTickers, getBRTDate, saveSnapshotForDate } from './snapshots';

const mockExecute = vi.mocked(db.execute);
const mockResolveActiveTickers = vi.mocked(resolveActiveTickers);
const mockGetBRTDate = vi.mocked(getBRTDate);
const mockSaveSnapshotForDate = vi.mocked(saveSnapshotForDate);

// 2024-01-08 (Monday) — a trading day
const TARGET_DATE = '2024-01-08';
// Timestamp: 2024-01-08 13:00 UTC = 2024-01-08 10:00 BRT
const JAN08_UTC_TS = 1704718800;

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

function mockFetchError(status: number, body = '') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: async () => body,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveSnapshotForDate.mockResolvedValue(true);
});

// ── yesterday ────────────────────────────────────────────────────────────────

describe('yesterday', () => {
  it('returns the previous calendar day in BRT when today is Tuesday', () => {
    // Tuesday 2024-01-09 12:00 BRT = 2024-01-09 15:00 UTC
    mockGetBRTDate.mockReturnValue(new Date('2024-01-09T15:00:00Z'));
    expect(yesterday()).toBe('2024-01-08');
  });

  it('returns Sunday when today is Monday BRT', () => {
    // Monday 2024-01-08 12:00 BRT
    mockGetBRTDate.mockReturnValue(new Date('2024-01-08T15:00:00Z'));
    expect(yesterday()).toBe('2024-01-07');
  });

  it('returns Saturday when today is Sunday BRT', () => {
    // Sunday 2024-01-07 12:00 BRT
    mockGetBRTDate.mockReturnValue(new Date('2024-01-07T15:00:00Z'));
    expect(yesterday()).toBe('2024-01-06');
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
});

// ── runHourlyInsightsJob ──────────────────────────────────────────────────────

describe('runHourlyInsightsJob', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns [] and logs when there are no active tickers', async () => {
    mockResolveActiveTickers.mockResolvedValue([]);

    const results = await runHourlyInsightsJob(TARGET_DATE);
    expect(results).toEqual([]);
  });

  it('processes a ticker and returns processed=1 saved=1 when candle is found', async () => {
    mockResolveActiveTickers.mockResolvedValue(['PETR4']);
    mockFetchWithCandles([{ date: JAN08_UTC_TS, close: 35.5 }]);

    const results = await runHourlyInsightsJob(TARGET_DATE);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ ticker: 'PETR4', processed: 1, saved: 1, duplicates: 0 });
  });

  it('counts duplicate when saveSnapshotForDate returns false', async () => {
    mockResolveActiveTickers.mockResolvedValue(['PETR4']);
    mockSaveSnapshotForDate.mockResolvedValue(false);
    mockFetchWithCandles([{ date: JAN08_UTC_TS, close: 35.5 }]);

    const results = await runHourlyInsightsJob(TARGET_DATE);

    expect(results[0]).toMatchObject({ processed: 1, saved: 0, duplicates: 1 });
  });

  it('calls saveSnapshotForDate with the correct ticker, price and date', async () => {
    mockResolveActiveTickers.mockResolvedValue(['PETR4']);
    mockFetchWithCandles([{ date: JAN08_UTC_TS, close: 35.5 }]);

    await runHourlyInsightsJob(TARGET_DATE);

    expect(mockSaveSnapshotForDate).toHaveBeenCalledWith('PETR4', 35.5, TARGET_DATE);
  });

  it('returns processed=0 when no candle matches the target date', async () => {
    mockResolveActiveTickers.mockResolvedValue(['PETR4']);
    // Candle for a different day (2024-01-07 13:00 UTC = 2024-01-07 BRT)
    mockFetchWithCandles([{ date: JAN08_UTC_TS - 86400, close: 34.0 }]);

    const results = await runHourlyInsightsJob(TARGET_DATE);

    expect(results[0]).toMatchObject({ processed: 0, saved: 0, duplicates: 0 });
    expect(mockSaveSnapshotForDate).not.toHaveBeenCalled();
  });

  it('records error and continues when fetch fails', async () => {
    mockResolveActiveTickers.mockResolvedValue(['PETR4', 'VALE3']);
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ symbol: 'VALE3', historicalDataPrice: [{ date: JAN08_UTC_TS, close: 90.0 }] }],
          }),
        }),
    );

    const results = await runHourlyInsightsJob(TARGET_DATE);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ ticker: 'PETR4', error: expect.stringContaining('network error') });
    expect(results[1]).toMatchObject({ ticker: 'VALE3', processed: 1, saved: 1 });
  });

  it('includes brapi error body in error message on non-ok response', async () => {
    mockResolveActiveTickers.mockResolvedValue(['PETR4']);
    mockFetchError(400, '{"code":"INVALID_INTERVAL"}');

    const results = await runHourlyInsightsJob(TARGET_DATE);

    expect(results[0].error).toContain('400');
    expect(results[0].error).toContain('INVALID_INTERVAL');
  });

  it('uses yesterday when no targetDate is provided', async () => {
    // Tuesday 2024-01-09 12:00 BRT → yesterday = 2024-01-08
    mockGetBRTDate.mockReturnValue(new Date('2024-01-09T15:00:00Z'));
    mockResolveActiveTickers.mockResolvedValue(['PETR4']);
    mockFetchWithCandles([{ date: JAN08_UTC_TS, close: 35.5 }]);

    await runHourlyInsightsJob();

    expect(mockSaveSnapshotForDate).toHaveBeenCalledWith('PETR4', 35.5, '2024-01-08');
  });
});
