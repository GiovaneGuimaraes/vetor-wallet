const BRAPI_BASE = 'https://brapi.dev/api/quote';

export interface FetchQuotesResult {
  /** ticker → cotação atual, para os tickers que a brapi retornou. */
  quotes: Map<string, number>;
  /**
   * true quando a própria requisição à brapi falhou (erro de rede, timeout ou
   * resposta não-ok) e por isso NENHUMA cotação pôde ser obtida — diferente
   * de um ticker específico simplesmente não vir no payload de uma resposta
   * bem-sucedida (ex.: ticker deslistado/typo), que não seta essa flag.
   */
  failed: boolean;
}

export async function fetchQuotes(tickers: string[]): Promise<FetchQuotesResult> {
  if (tickers.length === 0) return { quotes: new Map(), failed: false };

  const token = process.env.BRAPI_TOKEN;
  const joined = tickers.join(',');
  const url = token ? `${BRAPI_BASE}/${joined}?token=${token}` : `${BRAPI_BASE}/${joined}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { quotes: new Map(), failed: true };

    const data = (await res.json()) as {
      results?: { symbol: string; regularMarketPrice: number }[];
    };
    const map = new Map<string, number>();

    for (const item of data.results ?? []) {
      map.set(item.symbol, item.regularMarketPrice);
    }

    return { quotes: map, failed: false };
  } catch {
    return { quotes: new Map(), failed: true };
  }
}
