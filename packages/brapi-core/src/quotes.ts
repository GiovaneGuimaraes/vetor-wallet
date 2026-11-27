import { enqueueBrapi, _resetBrapiQueue } from './brapiQueue';

const BRAPI_BASE = 'https://brapi.dev/api/quote';

export interface FetchQuotesResult {
  /** ticker → cotação atual, para os tickers que a brapi retornou. */
  quotes: Map<string, number>;
  /**
   * true quando a requisição de ALGUM ticker falhou (rede, timeout, não-ok,
   * 429 esgotado) — os demais tickers seguem em `quotes`. Diferente de um
   * ticker simplesmente não vir no payload de uma resposta bem-sucedida
   * (ex.: deslistado/typo), que não seta essa flag.
   */
  failed: boolean;
}

/**
 * LIMITE DO PLANO GRÁTIS DA BRAPI (verificado com requisições reais): 1 ticker
 * por requisição e 1 requisição simultânea. 2+ tickers → HTTP 400
 * `QUOTES_PER_REQUEST_EXCEEDED`; concorrência → 429. Por isso cada ticker é uma
 * requisição própria e as requisições são SEMPRE em série (nunca Promise.all).
 * Cada 200 consome 1 da cota mensal (15.000); 4xx não consome.
 */

/**
 * TTL do cache em memória por ticker. A cotação do plano grátis já vem com
 * ~30 min de atraso, então 5 min de cache não deixa o dado perceptivelmente mais
 * velho, e evita que cada render/refresh/job gaste cota: uma carteira de N ativos
 * custa no máximo N requisições a cada 5 min, não N por chamada.
 */
export const QUOTE_CACHE_TTL_MS = 5 * 60 * 1000;

const MAX_ATTEMPTS = 3; // 1 tentativa + 2 retries em 429
const RETRY_BACKOFF_MS = [500, 1500];

const quoteCache = new Map<string, { price: number; expiresAt: number }>();

/**
 * Teto TOTAL de tempo de uma chamada a `fetchQuotes` (política tolerante).
 * Sem ele, N tickers × timeout de 5 s em série deixariam `GET /api/portfolio`
 * minutos pendurado com a brapi fora. Estourado o teto, os tickers que ainda não
 * responderam (ou nem começaram) voltam como falha (`failed: true`); o que já foi
 * obtido segue em `quotes`. A requisição em curso não é abortada: termina na
 * fila, popula o cache e serve a próxima chamada. A política estrita NÃO tem
 * teto (job com retry, sem usuário esperando).
 */
export const QUOTES_TOTAL_BUDGET_MS = 10_000;

/**
 * `inFlight` reaproveita a mesma Promise para um ticker já pedido (enfileirado
 * ou em voo), então chamadas concorrentes não duplicam requisição nem cota. A
 * fila em si (1 requisição por vez no processo) é a global de `brapiQueue.ts`,
 * compartilhada com o histórico diário dos gráficos.
 */
const inFlight = new Map<string, Promise<number | undefined>>();

/** Só para teste. */
export function _resetQuoteCache(): void {
  quoteCache.clear();
  inFlight.clear();
  _resetBrapiQueue();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Uma requisição à brapi para UM ticker. Devolve o preço, ou `undefined` se o
 * payload não trouxe o ticker (deslistado/typo). LANÇA em rede/timeout e em
 * status não-ok; 429 tem backoff curto antes de desistir. A mensagem de erro
 * nunca inclui a URL (que carrega o token).
 */
async function requestQuote(ticker: string): Promise<number | undefined> {
  const token = process.env.BRAPI_TOKEN;
  const path = encodeURIComponent(ticker);
  const url = token ? `${BRAPI_BASE}/${path}?token=${token}` : `${BRAPI_BASE}/${path}`;

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_BACKOFF_MS[attempt - 1]);
      continue;
    }
    if (!res.ok) throw new Error(`brapi responded with ${res.status} for ${ticker}`);

    const data = (await res.json()) as {
      results?: { symbol: string; regularMarketPrice: number }[];
    };
    return data.results?.find((r) => r.symbol === ticker)?.regularMarketPrice;
  }
}

/** Preço em cache e ainda válido, ou `undefined`. Não enfileira nada. */
function readCachedQuote(ticker: string): number | undefined {
  const cached = quoteCache.get(ticker);
  return cached && cached.expiresAt > Date.now() ? cached.price : undefined;
}

/**
 * Preço de UM ticker: cache → Promise já em voo → nova requisição na fila global.
 * Só preço obtido é cacheado — falha e ticker ausente do payload não entram.
 */
function getQuote(ticker: string): Promise<number | undefined> {
  const cached = readCachedQuote(ticker);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = inFlight.get(ticker);
  if (pending) return pending;

  const p = enqueueBrapi(() => requestQuote(ticker)).then((price) => {
    if (price !== undefined) {
      quoteCache.set(ticker, { price, expiresAt: Date.now() + QUOTE_CACHE_TTL_MS });
    }
    return price;
  });
  inFlight.set(ticker, p);
  const cleanup = () => {
    if (inFlight.get(ticker) === p) inFlight.delete(ticker);
  };
  p.then(cleanup, cleanup);
  return p;
}

/** Espera `p` por no máximo `ms`; estourado, rejeita (sem abortar `p`). */
function withinBudget<T>(p: Promise<T>, ms: number, ticker: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`orçamento de tempo esgotado para ${ticker}`)), ms);
  });
  return Promise.race([p, budget]).finally(() => clearTimeout(timer));
}

/**
 * Cotações de N tickers: dedupe, cache, coalescência e fila global (1 ticker por
 * requisição, 1 requisição por vez no processo). Estrito: a primeira falha lança,
 * sem teto de tempo. Tolerante: falhas por ticker são contadas e os demais
 * seguem, dentro de `QUOTES_TOTAL_BUDGET_MS`.
 */
async function requestQuotes(
  tickers: string[],
  strict: boolean
): Promise<{ quotes: Map<string, number>; failures: number }> {
  const quotes = new Map<string, number>();
  let failures = 0;
  const deadline = Date.now() + QUOTES_TOTAL_BUDGET_MS;

  for (const ticker of new Set(tickers)) {
    try {
      // Cache primeiro: ticker já cotado responde mesmo com o orçamento esgotado.
      const cached = readCachedQuote(ticker);
      if (cached !== undefined) {
        quotes.set(ticker, cached);
        continue;
      }
      let pending: Promise<number | undefined>;
      if (strict) {
        pending = getQuote(ticker);
      } else {
        // Passou do teto: falha SEM enfileirar (não gasta cota nem ocupa a fila).
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`orçamento de tempo esgotado para ${ticker}`);
        pending = withinBudget(getQuote(ticker), remaining, ticker);
      }
      const price = await pending;
      if (price !== undefined) quotes.set(ticker, price);
    } catch (err) {
      if (strict) throw err;
      failures++;
      console.warn(
        `[brapi] cotação de ${ticker} indisponível: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return { quotes, failures };
}

/**
 * Política TOLERANTE (telas): nunca lança. Falha de um ticker não derruba os
 * demais; `failed: true` sinaliza que ao menos um falhou. Lista vazia não chama
 * a brapi.
 */
export async function fetchQuotes(tickers: string[]): Promise<FetchQuotesResult> {
  if (tickers.length === 0) return { quotes: new Map(), failed: false };

  const { quotes, failures } = await requestQuotes(tickers, false);
  return { quotes, failed: failures > 0 };
}

/**
 * Política ESTRITA (coleta de snapshots): LANÇA na primeira falha de ticker
 * (rede, timeout, status não-ok) e em resposta sem nenhum preço para tickers
 * pedidos — para o retry agir e para nunca gravar um preço inventado. Ticker
 * ausente do payload só fica fora do mapa. Com `tickers` vazio não faz
 * requisição. O cache vale também aqui: o retry não repete os tickers que já
 * deram certo na tentativa anterior.
 */
export async function fetchQuotesStrict(tickers: string[]): Promise<Map<string, number>> {
  const { quotes } = await requestQuotes(tickers, true);
  if (quotes.size === 0 && tickers.length > 0) throw new Error('brapi returned empty results');
  return quotes;
}
