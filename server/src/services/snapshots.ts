import type { QuoteSnapshot } from '@vetor-wallet/shared';
import { db } from '../db';

const BRAPI_BASE = 'https://brapi.dev/api/quote';

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns a Date whose UTC fields equal the current wall-clock time in BRT (UTC-3).
 * Use .getUTCHours() / .getUTCDay() etc. to read BRT time components.
 * Brazil abolished DST in 2019, so BRT = UTC-3 year-round.
 */
export function getBRTDate(): Date {
  const now = new Date();
  return new Date(now.getTime() - 3 * 60 * 60 * 1000);
}

/** Returns true if the given BRT date falls Mon-Fri. */
export function isBusinessDay(brtDate: Date): boolean {
  const day = brtDate.getUTCDay(); // 0=Sun, 6=Sat
  return day !== 0 && day !== 6;
}

// ── Retry / backoff ───────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, delayMs = 1000): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const backoff = delayMs * attempt;
        console.warn(`[snapshots] Attempt ${attempt}/${maxAttempts} failed, retrying in ${backoff}ms`);
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}

// ── Quote fetch (throws on error so withRetry can act) ────────────────────────

async function fetchQuotesStrict(tickers: string[]): Promise<Map<string, number>> {
  const token = process.env.BRAPI_TOKEN;
  const joined = tickers.join(',');
  const url = token ? `${BRAPI_BASE}/${joined}?token=${token}` : `${BRAPI_BASE}/${joined}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`brapi responded with ${res.status}`);

  const data = (await res.json()) as {
    results?: { symbol: string; regularMarketPrice: number }[];
  };

  const map = new Map<string, number>();
  for (const item of data.results ?? []) {
    map.set(item.symbol, item.regularMarketPrice);
  }
  if (map.size === 0 && tickers.length > 0) throw new Error('brapi returned empty results');
  return map;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/** Returns tickers of assets with a positive net position across all users. */
export async function resolveActiveTickers(): Promise<string[]> {
  const result = await db.execute(
    `SELECT ticker
     FROM operations
     GROUP BY ticker
     HAVING SUM(CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END) > 0`,
  );
  return result.rows.map((r) => r.ticker as string);
}

/**
 * Inserts a snapshot using INSERT OR IGNORE so the UNIQUE(ticker, date) constraint
 * silently prevents duplicates if the job runs more than once on the same day.
 * Returns true if the row was inserted, false if it was a duplicate.
 */
export async function saveSnapshot(ticker: string, price: number): Promise<boolean> {
  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO quote_snapshots (ticker, price) VALUES (?, ?)`,
    args: [ticker, price],
  });
  return result.rowsAffected > 0;
}

export async function getSnapshotHistory(
  ticker: string,
  from?: string,
  to?: string,
): Promise<QuoteSnapshot[]> {
  let sql = 'SELECT id, ticker, price, captured_at FROM quote_snapshots WHERE ticker = ?';
  const args: (string | number)[] = [ticker];
  if (from) { sql += ' AND date(captured_at) >= ?'; args.push(from); }
  if (to) { sql += ' AND date(captured_at) <= ?'; args.push(to); }
  sql += ' ORDER BY captured_at ASC';

  const result = await db.execute({ sql, args });
  return result.rows.map((r) => ({
    id: Number(r.id),
    ticker: r.ticker as string,
    price: Number(r.price),
    captured_at: r.captured_at as string,
  }));
}

// ── Main job ──────────────────────────────────────────────────────────────────

export async function runSnapshotJob(): Promise<void> {
  const tickers = await resolveActiveTickers();
  if (tickers.length === 0) {
    console.log('[snapshots] No active tickers — skipping job');
    return;
  }

  let quotesMap: Map<string, number>;
  try {
    quotesMap = await withRetry(() => fetchQuotesStrict(tickers));
  } catch (err) {
    console.error('[snapshots] Failed to fetch quotes after retries:', err);
    return;
  }

  let saved = 0;
  for (const [ticker, price] of quotesMap) {
    const inserted = await saveSnapshot(ticker, price);
    if (inserted) saved++;
  }

  const fetched = quotesMap.size;
  const duplicate = fetched - saved;
  console.log(
    `[snapshots] Job complete — ${saved} saved, ${duplicate} duplicate(s) skipped, ` +
    `${tickers.length - fetched} ticker(s) without quote`,
  );
}

// ── Catch-up on startup ───────────────────────────────────────────────────────

/**
 * Runs the snapshot job if no snapshots exist for today and it's past 18:15 BRT
 * on a business day. Handles the case where the server was down during market close.
 */
export async function catchUpIfNeeded(): Promise<void> {
  const brt = getBRTDate();

  if (!isBusinessDay(brt)) return;

  const brtHour = brt.getUTCHours();
  const brtMinute = brt.getUTCMinutes();
  if (brtHour < 18 || (brtHour === 18 && brtMinute < 15)) return;

  // date(captured_at) in SQLite extracts UTC date from stored datetime('now')
  const todayUTC = new Date().toISOString().split('T')[0];
  const existing = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM quote_snapshots WHERE date(captured_at) = ?`,
    args: [todayUTC],
  });

  if (Number(existing.rows[0].cnt) === 0) {
    console.log(`[snapshots] Catch-up: no snapshots for ${todayUTC}, running job now`);
    await runSnapshotJob();
  }
}
