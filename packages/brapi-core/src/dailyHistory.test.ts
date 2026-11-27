import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDailyHistory, _resetHistoryCache, HISTORY_CACHE_TTL_MS } from './fetchDailyHistory';
import { requestDailyHistory } from './requestDailyHistory';
import { BrapiStatusError } from './BrapiStatusError';
import { fetchQuotes, _resetQuoteCache } from './quotes';

// 2026-11-24 e 2026-11-25, meia-noite de Brasília (03:00 UTC), como a brapi manda.
const D1 = Date.UTC(2026, 10, 24, 3) / 1000;
const D2 = Date.UTC(2026, 10, 25, 3) / 1000;

const historyBody = (symbol: string) => ({
  results: [
    {
      symbol,
      shortName: 'CURTO',
      longName: 'Empresa Longa SA',
      regularMarketPrice: 12.5,
      regularMarketChangePercent: 1.2,
      historicalDataPrice: [
        { date: D2, close: 12 },
        { date: D1, close: 11 },
        { date: D2, close: 99 }, // duplicado: fica o primeiro
        { date: null, close: 1 },
        { date: D1, close: null },
      ],
    },
  ],
});

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  _resetHistoryCache();
  _resetQuoteCache();
  delete process.env.BRAPI_TOKEN;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('requestDailyHistory', () => {
  it('pede range=3mo&interval=1d, traduz e ordena os pontos no fuso de SP', async () => {
    const f = vi.fn(async () => ok(historyBody('PETR4')));
    vi.stubGlobal('fetch', f);

    const h = await requestDailyHistory('PETR4');

    expect(String(f.mock.calls[0][0])).toBe(
      'https://brapi.dev/api/quote/PETR4?range=3mo&interval=1d'
    );
    expect(h).toMatchObject({
      ticker: 'PETR4',
      name: 'Empresa Longa SA',
      price: 12.5,
      changePercent: 1.2,
      points: [
        { date: '2026-11-24', close: 11 },
        { date: '2026-11-25', close: 12 },
      ],
    });
    expect(Number.isNaN(Date.parse(h.fetchedAt))).toBe(false);
  });

  it('codifica ^BVSP, anexa o token e cai para shortName/null quando faltam campos', async () => {
    process.env.BRAPI_TOKEN = 'segredo';
    const f = vi.fn(async () =>
      ok({ results: [{ symbol: '^BVSP', shortName: 'IBOVESPA', historicalDataPrice: [] }] })
    );
    vi.stubGlobal('fetch', f);

    const h = await requestDailyHistory('^BVSP');

    expect(String(f.mock.calls[0][0])).toBe(
      'https://brapi.dev/api/quote/%5EBVSP?range=3mo&interval=1d&token=segredo'
    );
    expect(h).toMatchObject({ name: 'IBOVESPA', price: null, changePercent: null, points: [] });
  });

  it('payload sem results vira histórico vazio, sem nome', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({}))
    );
    const h = await requestDailyHistory('XXXX3');
    expect(h).toMatchObject({ name: null, points: [] });
  });

  it('status não-ok lança BrapiStatusError com o status e sem a URL/token', async () => {
    process.env.BRAPI_TOKEN = 'segredo';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x', { status: 404 }))
    );
    const err = await requestDailyHistory('NOPE3').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BrapiStatusError);
    expect((err as BrapiStatusError).status).toBe(404);
    expect((err as Error).message).toBe('brapi responded with 404 for NOPE3');
    expect((err as Error).message).not.toContain('segredo');
  });

  it('429: tenta de novo com backoff e depois sucede', async () => {
    vi.useFakeTimers();
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response('x', { status: 429 }))
      .mockResolvedValueOnce(ok(historyBody('PETR4')));
    vi.stubGlobal('fetch', f);
    const p = requestDailyHistory('PETR4');
    await vi.advanceTimersByTimeAsync(600);
    await expect(p).resolves.toMatchObject({ ticker: 'PETR4' });
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('fetchDailyHistory', () => {
  it('cacheia por HISTORY_CACHE_TTL_MS (12 h): 1 requisição por ticker dentro do TTL', async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => ok(historyBody('PETR4')));
    vi.stubGlobal('fetch', f);

    await fetchDailyHistory('PETR4');
    await fetchDailyHistory('PETR4');
    expect(f).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + HISTORY_CACHE_TTL_MS + 1);
    await fetchDailyHistory('PETR4');
    expect(f).toHaveBeenCalledTimes(2);
    expect(HISTORY_CACHE_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });

  it('erro NÃO é cacheado: a chamada seguinte tenta de novo', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response('x', { status: 500 }))
      .mockResolvedValue(ok(historyBody('PETR4')));
    vi.stubGlobal('fetch', f);

    await expect(fetchDailyHistory('PETR4')).rejects.toBeInstanceOf(BrapiStatusError);
    await expect(fetchDailyHistory('PETR4')).resolves.toMatchObject({ ticker: 'PETR4' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('chamadas concorrentes do mesmo ticker compartilham 1 requisição', async () => {
    const f = vi.fn(async () => ok(historyBody('VALE3')));
    vi.stubGlobal('fetch', f);
    const [a, b] = await Promise.all([fetchDailyHistory('VALE3'), fetchDailyHistory('VALE3')]);
    expect(a).toBe(b);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('usa a MESMA fila das cotações: histórico e cotação nunca ficam 2 em voo', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const f = vi.fn(async (url: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const symbol = url.split('?')[0].split('/').pop()!;
      return url.includes('range=')
        ? ok(historyBody(symbol))
        : ok({ results: [{ symbol, regularMarketPrice: 10 }] });
    });
    vi.stubGlobal('fetch', f);

    await Promise.all([
      fetchDailyHistory('PETR4'),
      fetchQuotes(['VALE3', 'ITUB4']),
      fetchDailyHistory('WEGE3'),
    ]);

    expect(maxInFlight).toBe(1);
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('prioridade: cotação pedida DEPOIS passa à frente de históricos já enfileirados', async () => {
    const order: string[] = [];
    const f = vi.fn(async (url: string) => {
      const symbol = url.split('?')[0].split('/').pop()!;
      const kind = url.includes('range=') ? 'H' : 'Q';
      order.push(`${kind}:${symbol}`);
      await new Promise((r) => setTimeout(r, 5));
      return kind === 'H'
        ? ok(historyBody(symbol))
        : ok({ results: [{ symbol, regularMarketPrice: 10 }] });
    });
    vi.stubGlobal('fetch', f);

    const histories = ['H1', 'H2', 'H3', 'H4'].map((t) => fetchDailyHistory(t));
    await new Promise((r) => setTimeout(r, 1)); // H1 já em voo
    const quotes = fetchQuotes(['PETR4', 'VALE3']);
    await Promise.all([...histories, quotes]);

    // H1 já tinha começado (sem preempção); as cotações furam a fila dos demais.
    expect(order).toEqual(['H:H1', 'Q:PETR4', 'Q:VALE3', 'H:H2', 'H:H3', 'H:H4']);
  });

  it('cenário medido: 16 históricos de cache frio + 10 cotações a 600 ms não estouram o teto', async () => {
    vi.useFakeTimers();
    const f = vi.fn(
      (url: string) =>
        new Promise<Response>((resolve) => {
          const symbol = url.split('?')[0].split('/').pop()!;
          const body = url.includes('range=')
            ? historyBody(symbol)
            : { results: [{ symbol, regularMarketPrice: 10 }] };
          setTimeout(() => resolve(ok(body)), 600);
        })
    );
    vi.stubGlobal('fetch', f);

    const histories = Array.from({ length: 16 }, (_, i) => fetchDailyHistory(`HIST${i}`));
    await vi.advanceTimersByTimeAsync(1);
    const tickers = Array.from({ length: 10 }, (_, i) => `CART${i}3`);
    const p = fetchQuotes(tickers);
    await vi.advanceTimersByTimeAsync(10_000);
    const { quotes, failed } = await p;

    expect(failed).toBe(false);
    expect(quotes.size).toBe(10);
    await vi.runAllTimersAsync();
    await Promise.all(histories);
  });

  it('erro de um job não trava a fila: o próximo (de qualquer prioridade) segue', async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValue(ok({ results: [{ symbol: 'PETR4', regularMarketPrice: 10 }] }));
    vi.stubGlobal('fetch', f);
    const h = fetchDailyHistory('X1').catch((e: Error) => e.message);
    await new Promise((r) => setTimeout(r, 0)); // o histórico já está em voo
    const q = fetchQuotes(['PETR4']);
    expect(await h).toBe('rede');
    expect((await q).quotes.get('PETR4')).toBe(10);
  });
});
