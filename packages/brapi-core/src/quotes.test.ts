import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchQuotes, fetchQuotesStrict } from './quotes';

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
      await fetchQuotes(['PETR4']);
    } finally {
      if (original === undefined) delete process.env.BRAPI_TOKEN;
      else process.env.BRAPI_TOKEN = original;
    }
    expect(fetchMock.mock.calls[0][0]).toBe('https://brapi.dev/api/quote/PETR4,VALE3');
    expect(fetchMock.mock.calls[1][0]).toBe('https://brapi.dev/api/quote/PETR4?token=tok');
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { symbol: 'PETR4', regularMarketPrice: 38.5 },
          { symbol: 'VALE3', regularMarketPrice: 61 },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const map = await fetchQuotesStrict(['PETR4', 'VALE3']);

    expect(map).toEqual(
      new Map([
        ['PETR4', 38.5],
        ['VALE3', 61],
      ])
    );
    expect(fetchMock.mock.calls[0][0]).toBe('https://brapi.dev/api/quote/PETR4,VALE3');
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
