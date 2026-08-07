import type { TickerInfo } from '@vetor-wallet/shared';

const BRAPI_LIST = 'https://brapi.dev/api/quote/list';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface TickerCache {
  data: TickerInfo[];
  fetchedAt: number;
}

let tickerCache: TickerCache | null = null;

async function fetchTickerList(): Promise<TickerInfo[]> {
  const token = process.env.BRAPI_TOKEN;
  const url = token ? `${BRAPI_LIST}?token=${token}` : BRAPI_LIST;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`brapi responded ${res.status}`);
  const data = (await res.json()) as { stocks?: { stock: string; name: string }[] };
  return (data.stocks ?? []).map((s) => ({ ticker: s.stock, name: s.name }));
}

async function getCache(): Promise<TickerInfo[] | null> {
  const now = Date.now();
  if (tickerCache && now - tickerCache.fetchedAt < CACHE_TTL_MS) {
    return tickerCache.data;
  }
  try {
    const data = await fetchTickerList();
    tickerCache = { data, fetchedAt: now };
    return data;
  } catch {
    return tickerCache ? tickerCache.data : null;
  }
}

export async function searchTickers(query: string): Promise<{ results: TickerInfo[]; listAvailable: boolean }> {
  const list = await getCache();
  if (!list) return { results: [], listAvailable: false };
  if (!query.trim()) return { results: list.slice(0, 20), listAvailable: true };

  const q = query.toUpperCase().trim();
  const results = list
    .filter((t) => t.ticker.startsWith(q) || t.name.toUpperCase().includes(q))
    .slice(0, 20);
  return { results, listAvailable: true };
}

export async function getUnknownTickers(tickers: string[]): Promise<string[]> {
  const list = await getCache();
  if (!list) return [];
  const known = new Set(list.map((t) => t.ticker));
  return tickers.filter((t) => !known.has(t));
}

export function _resetCache(): void {
  tickerCache = null;
}

export function _setCache(data: TickerInfo[], fetchedAt: number): void {
  tickerCache = { data, fetchedAt };
}
