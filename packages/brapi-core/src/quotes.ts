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

/**
 * A requisição única à brapi, compartilhada pelas duas políticas de erro.
 * LANÇA em rede/timeout (erro original) e em status não-ok. Não decide o que
 * fazer com isso — quem chama é que escolhe degradar ou propagar.
 */
async function requestQuotes(tickers: string[]): Promise<Map<string, number>> {
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
  return map;
}

/**
 * Política TOLERANTE (telas): nunca lança. Falha da requisição vira
 * `{ quotes: vazio, failed: true }`; lista vazia não chama a brapi.
 */
export async function fetchQuotes(tickers: string[]): Promise<FetchQuotesResult> {
  if (tickers.length === 0) return { quotes: new Map(), failed: false };

  try {
    return { quotes: await requestQuotes(tickers), failed: false };
  } catch {
    return { quotes: new Map(), failed: true };
  }
}

/**
 * Política ESTRITA (coleta de snapshots): LANÇA em erro de rede, status
 * não-ok e resposta sem nenhum resultado para tickers pedidos — para o retry
 * agir e para nunca gravar um preço inventado. Ticker ausente de um payload
 * não-vazio só fica fora do mapa. Com `tickers` vazio ainda faz a requisição
 * (comportamento herdado do client que vivia no portfolio-core).
 */
export async function fetchQuotesStrict(tickers: string[]): Promise<Map<string, number>> {
  const map = await requestQuotes(tickers);
  if (map.size === 0 && tickers.length > 0) throw new Error('brapi returned empty results');
  return map;
}
