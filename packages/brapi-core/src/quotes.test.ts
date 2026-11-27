import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fetchQuotes, fetchQuotesStrict, _resetQuoteCache, QUOTE_CACHE_TTL_MS } from './quotes';

const okPayload = (symbol: string, price: number) => ({
  ok: true,
  status: 200,
  json: async () => ({ results: [{ symbol, regularMarketPrice: price }] }),
});

beforeEach(() => {
  _resetQuoteCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('fetchQuotes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty map and failed=true (prices null upstream) when the request times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError'))
    );

    const { quotes, failed } = await fetchQuotes(['PETR4']);

    expect(quotes.size).toBe(0);
    expect(quotes.get('PETR4')).toBeUndefined();
    expect(failed).toBe(true);
  });

  it('passes an abort signal so slow requests are cancelled instead of hanging', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ symbol: 'PETR4', regularMarketPrice: 30 }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchQuotes(['PETR4']);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(Object) })
    );
  });

  it('returns an empty map and failed=true on a generic network error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { quotes, failed } = await fetchQuotes(['PETR4']);

    expect(quotes.size).toBe(0);
    expect(failed).toBe(true);
  });

  it('returns failed=true when the brapi response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const { quotes, failed } = await fetchQuotes(['PETR4']);

    expect(quotes.size).toBe(0);
    expect(failed).toBe(true);
  });

  it('returns failed=false and populated quotes on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ symbol: 'PETR4', regularMarketPrice: 30 }] }),
      })
    );

    const { quotes, failed } = await fetchQuotes(['PETR4']);

    expect(failed).toBe(false);
    expect(quotes.get('PETR4')).toBe(30);
  });

  it('returns failed=false for an empty ticker list without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { quotes, failed } = await fetchQuotes([]);

    expect(failed).toBe(false);
    expect(quotes.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a ticker missing from a successful payload as absent, not failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ symbol: 'PETR4', regularMarketPrice: 30 }] }),
      })
    );

    const { quotes, failed } = await fetchQuotes(['PETR4', 'XXXX3']);

    expect(failed).toBe(false);
    expect(quotes.get('XXXX3')).toBeUndefined();
    expect(quotes.get('PETR4')).toBe(30);
  });

  it('returns failed=false and an empty map when the payload has no results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const { quotes, failed } = await fetchQuotes(['PETR4']);

    expect(failed).toBe(false);
    expect(quotes.size).toBe(0);
  });

  it('builds the URL without token, then with BRAPI_TOKEN', async () => {
    const original = process.env.BRAPI_TOKEN;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    try {
      delete process.env.BRAPI_TOKEN;
      await fetchQuotes(['PETR4', 'VALE3']);
      process.env.BRAPI_TOKEN = 'tok';
      await fetchQuotes(['ITUB4']);
    } finally {
      if (original === undefined) delete process.env.BRAPI_TOKEN;
      else process.env.BRAPI_TOKEN = original;
    }
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://brapi.dev/api/quote/PETR4',
      'https://brapi.dev/api/quote/VALE3',
      'https://brapi.dev/api/quote/ITUB4?token=tok',
    ]);
  });
});

describe('fetchQuotesStrict', () => {
  const original = process.env.BRAPI_TOKEN;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (original === undefined) delete process.env.BRAPI_TOKEN;
    else process.env.BRAPI_TOKEN = original;
  });

  it('returns the ticker -> price map on success, with timeout signal and no token', async () => {
    delete process.env.BRAPI_TOKEN;
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.includes('PETR4') ? okPayload('PETR4', 38.5) : okPayload('VALE3', 61)
      );
    vi.stubGlobal('fetch', fetchMock);

    const map = await fetchQuotesStrict(['PETR4', 'VALE3']);

    expect(map).toEqual(
      new Map([
        ['PETR4', 38.5],
        ['VALE3', 61],
      ])
    );
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://brapi.dev/api/quote/PETR4',
      'https://brapi.dev/api/quote/VALE3',
    ]);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ signal: expect.any(Object) })
    );
  });

  it('appends the token when BRAPI_TOKEN is set', async () => {
    process.env.BRAPI_TOKEN = 'tok-de-teste';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ symbol: 'PETR4', regularMarketPrice: 1 }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchQuotesStrict(['PETR4']);

    expect(fetchMock.mock.calls[0][0]).toBe('https://brapi.dev/api/quote/PETR4?token=tok-de-teste');
  });

  it('THROWS on a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(fetchQuotesStrict(['PETR4'])).rejects.toThrow('brapi responded with 503');
  });

  it('THROWS on a network error (propagates the original error)', async () => {
    const err = new Error('network down');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));

    await expect(fetchQuotesStrict(['PETR4'])).rejects.toBe(err);
  });

  it('THROWS when the payload has no results for requested tickers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    await expect(fetchQuotesStrict(['PETR4'])).rejects.toThrow('brapi returned empty results');
  });

  it('a ticker missing from a non-empty payload is just absent from the map', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ symbol: 'PETR4', regularMarketPrice: 30 }] }),
      })
    );

    const map = await fetchQuotesStrict(['PETR4', 'XXXX3']);

    expect(map.get('PETR4')).toBe(30);
    expect(map.has('XXXX3')).toBe(false);
  });

  it('with no tickers requested, an empty payload is an empty map (not an error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    );

    await expect(fetchQuotesStrict([])).resolves.toEqual(new Map());
  });
});

describe('plano grátis: 1 ticker por requisição, em série', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('2+ tickers geram N chamadas seriais, nunca concorrentes, sem vírgula na URL', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const symbol = url.split('/').pop()!;
      return okPayload(symbol, 10);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { quotes, failed } = await fetchQuotes(['PETR4', 'VALE3', 'ITUB4']);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes(','))).toBe(true);
    expect(failed).toBe(false);
    expect([...quotes.keys()]).toEqual(['PETR4', 'VALE3', 'ITUB4']);
  });

  it('deduplica tickers repetidos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okPayload('PETR4', 30));
    vi.stubGlobal('fetch', fetchMock);

    await fetchQuotes(['PETR4', 'PETR4']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tolerante: falha de um ticker não derruba os demais; failed=true', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async (url: string) =>
          url.endsWith('VALE3') ? { ok: false, status: 400 } : okPayload(url.split('/').pop()!, 7)
        )
    );

    const { quotes, failed } = await fetchQuotes(['PETR4', 'VALE3', 'ITUB4']);

    expect(failed).toBe(true);
    expect(quotes.get('PETR4')).toBe(7);
    expect(quotes.get('ITUB4')).toBe(7);
    expect(quotes.has('VALE3')).toBe(false);
  });

  it('estrito: lança na falha de um ticker e não segue para os próximos', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith('VALE3') ? { ok: false, status: 400 } : okPayload(url.split('/').pop()!, 7)
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchQuotesStrict(['PETR4', 'VALE3', 'ITUB4'])).rejects.toThrow(
      'brapi responded with 400 for VALE3'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('o erro nunca vaza o token', async () => {
    process.env.BRAPI_TOKEN = 'segredo-123';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    try {
      await fetchQuotes(['PETR4']);
      await expect(fetchQuotesStrict(['VALE3'])).rejects.not.toThrow(/segredo-123/);
      const logged = (console.warn as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ');
      expect(logged).not.toContain('segredo-123');
    } finally {
      delete process.env.BRAPI_TOKEN;
    }
  });

  it('cache: segunda chamada dentro do TTL não vai à rede; depois do TTL vai', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(okPayload('PETR4', 30));
    vi.stubGlobal('fetch', fetchMock);

    await fetchQuotes(['PETR4']);
    const again = await fetchQuotes(['PETR4']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(again.quotes.get('PETR4')).toBe(30);
    // o cache vale para a política estrita também
    await fetchQuotesStrict(['PETR4']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(QUOTE_CACHE_TTL_MS + 1);
    await fetchQuotes(['PETR4']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cache: falha e ticker ausente do payload não são cacheados', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ results: [] }) })
      .mockResolvedValue(okPayload('PETR4', 30));
    vi.stubGlobal('fetch', fetchMock);

    await fetchQuotes(['PETR4']);
    await fetchQuotes(['PETR4']);
    const third = await fetchQuotes(['PETR4']);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(third.quotes.get('PETR4')).toBe(30);
  });

  it('retry curto em 429 e depois sucesso', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValue(okPayload('PETR4', 30));
    vi.stubGlobal('fetch', fetchMock);

    const p = fetchQuotes(['PETR4']);
    await vi.runAllTimersAsync();
    const { quotes, failed } = await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(failed).toBe(false);
    expect(quotes.get('PETR4')).toBe(30);
  });

  it('429 persistente desiste após 3 tentativas', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);

    const p = fetchQuotes(['PETR4']);
    await vi.runAllTimersAsync();
    const { failed } = await p;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(failed).toBe(true);
  });
});
