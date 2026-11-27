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
});
