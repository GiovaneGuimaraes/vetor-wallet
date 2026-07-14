// Fetches the daily closing price for each active ticker via brapi.dev (interval=1d)
// and persists it into quote_snapshots for the target date.
// Runs from the CLI as a historical backfill — covers days the server was offline
// or dates the snapshot job didn't capture.
//
// NOTE: interval=1h requires a paid brapi plan. When upgraded, restore the hourly
// logic in saveHourlyInsight and switch fetchDailyClose back to interval=1h.

import PQueue from 'p-queue';
import { db } from '../db';
import { resolveActiveTickers, getBRTDate, saveSnapshotForDate, withRetry } from './snapshots';

const BRAPI_BASE = 'https://brapi.dev/api/quote';

// 1 request per 2 s — conservative margin for brapi's authenticated rate limit.
const queue = new PQueue({ concurrency: 1, interval: 2000, intervalCap: 1 });

async function fetchDailyClose(ticker: string, targetDate: string): Promise<number | null> {
  const token = process.env.BRAPI_TOKEN;
  const params = `range=5d&interval=1d${token ? `&token=${token}` : ''}`;
  const url = `${BRAPI_BASE}/${ticker}?${params}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`brapi responded with ${res.status} for ${ticker}: ${body}`);
  }

  const data = (await res.json()) as {
    results?: { symbol: string; historicalDataPrice?: { date: number; close: number }[] }[];
  };

  const candles = data.results?.[0]?.historicalDataPrice;
  if (!candles?.length) throw new Error(`brapi returned no candles for ${ticker}`);

  // brapi daily timestamps may be anchored to UTC midnight or BRT market open;
  // check both UTC and BRT date to handle either convention.
  const candle = candles.find((c) => {
    const utcDate = new Date(c.date * 1000).toISOString().split('T')[0];
    const brtDate = new Date(c.date * 1000 - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
    return utcDate === targetDate || brtDate === targetDate;
  });

  return candle?.close ?? null;
}

// Preserved for future use when interval=1h becomes available on the plan.
export async function saveHourlyInsight(
  ticker: string,
  quoteDate: string,
  hour: number,
  price: number,
): Promise<boolean> {
  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO hourly_quote_insights (ticker, quote_date, hour, price) VALUES (?, ?, ?, ?)`,
    args: [ticker, quoteDate, hour, price],
  });
  return result.rowsAffected > 0;
}

export interface InsightJobResult {
  ticker: string;
  processed: number;
  saved: number;
  duplicates: number;
  error?: string;
}

export function yesterday(): string {
  const brt = getBRTDate();
  const prev = new Date(brt.getTime() - 24 * 60 * 60 * 1000);
  return prev.toISOString().split('T')[0];
}

async function processTicker(ticker: string, date: string): Promise<InsightJobResult> {
  const r: InsightJobResult = { ticker, processed: 0, saved: 0, duplicates: 0 };

  try {
    const close = await withRetry(() => fetchDailyClose(ticker, date));
    if (close === null) {
      console.log(`[hourly-insights] No candle for ${ticker} on ${date} — non-trading day?`);
      return r;
    }

    r.processed = 1;
    const inserted = await saveSnapshotForDate(ticker, close, date);
    if (inserted) r.saved = 1;
    else r.duplicates = 1;
  } catch (err) {
    r.error = err instanceof Error ? err.message : String(err);
    console.error(`[hourly-insights] Failed for ${ticker}:`, err);
  }

  return r;
}

export async function runHourlyInsightsJob(targetDate?: string): Promise<InsightJobResult[]> {
  const tickers = await resolveActiveTickers();
  if (tickers.length === 0) {
    console.log('[hourly-insights] No active tickers — skipping job');
    return [];
  }

  const date = targetDate ?? yesterday();
  console.log(`[hourly-insights] Processing ${tickers.length} ticker(s) for ${date}`);

  const results = await Promise.all(
    tickers.map((ticker) => queue.add(() => processTicker(ticker, date))),
  );

  return results.filter((r): r is InsightJobResult => r !== undefined);
}
