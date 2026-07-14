// Plan A implementation: fetches hourly candles for the previous business day via
// brapi.dev range+interval params (`range=5d&interval=1h`), filters to targetDate, and
// persists each BRT hour bucket via INSERT OR IGNORE.
//
// If brapi does NOT support historicalDataPrice on the current plan/token, switch to
// Plan B (live hourly polling during market hours) — see issue notes for details.

import PQueue from 'p-queue';
import { db } from '../db';
import { resolveActiveTickers, getBRTDate, saveSnapshot, withRetry } from './snapshots';

const BRAPI_BASE = 'https://brapi.dev/api/quote';

// 1 request per 2 s — conservative margin for brapi's authenticated rate limit.
const queue = new PQueue({ concurrency: 1, interval: 2000, intervalCap: 1 });

interface BrapiCandle {
  date: number;  // Unix timestamp in seconds (UTC)
  close: number;
}

async function fetchHourlyCandles(ticker: string): Promise<BrapiCandle[]> {
  const token = process.env.BRAPI_TOKEN;
  const params = `range=5d&interval=1h${token ? `&token=${token}` : ''}`;
  const url = `${BRAPI_BASE}/${ticker}?${params}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`brapi responded with ${res.status} for ${ticker}`);

  const data = (await res.json()) as {
    results?: { symbol: string; historicalDataPrice?: BrapiCandle[] }[];
  };

  const candles = data.results?.[0]?.historicalDataPrice;
  if (!candles?.length) throw new Error(`brapi returned no historical candles for ${ticker}`);
  return candles;
}

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
    const candles = await withRetry(() => fetchHourlyCandles(ticker));

    const dayCandles = candles.filter((c) => {
      const brtDt = new Date(c.date * 1000 - 3 * 60 * 60 * 1000);
      return brtDt.toISOString().split('T')[0] === date;
    });

    for (const candle of dayCandles) {
      const brtDt = new Date(candle.date * 1000 - 3 * 60 * 60 * 1000);
      const hour = brtDt.getUTCHours();
      r.processed++;
      const inserted = await saveHourlyInsight(ticker, date, hour, candle.close);
      if (inserted) r.saved++;
      else r.duplicates++;
    }

    // Bridge: upsert last candle of the day into quote_snapshots so that
    // GET /api/snapshots/:ticker continues to serve data without changes.
    if (dayCandles.length > 0) {
      await saveSnapshot(ticker, dayCandles[dayCandles.length - 1].close);
    }
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
