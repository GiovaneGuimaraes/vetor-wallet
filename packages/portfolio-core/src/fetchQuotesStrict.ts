const BRAPI_BASE = 'https://brapi.dev/api/quote';

/**
 * Cotações da brapi que LANÇAM em erro (rede, status não-ok, resposta vazia),
 * para o `withRetry` da coleta agir. Contrato oposto, de propósito, ao
 * `fetchQuotes` de `@vetor-wallet/brapi-core`, que degrada em silêncio — ver
 * "Pendências" no `CLAUDE.md` do package. Fora do barrel: só a coleta usa.
 */
export async function fetchQuotesStrict(tickers: string[]): Promise<Map<string, number>> {
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
