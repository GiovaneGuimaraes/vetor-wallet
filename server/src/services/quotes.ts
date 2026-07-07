const BRAPI_BASE = 'https://brapi.dev/api/quote';

export async function fetchQuotes(tickers: string[]): Promise<Map<string, number>> {
  if (tickers.length === 0) return new Map();

  const token = process.env.BRAPI_TOKEN;
  const joined = tickers.join(',');
  const url = token ? `${BRAPI_BASE}/${joined}?token=${token}` : `${BRAPI_BASE}/${joined}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return new Map();

    const data = (await res.json()) as {
      results?: { symbol: string; regularMarketPrice: number }[];
    };
    const map = new Map<string, number>();

    for (const item of data.results ?? []) {
      map.set(item.symbol, item.regularMarketPrice);
    }

    return map;
  } catch {
    return new Map();
  }
}
