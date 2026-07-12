import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchQuotes } from './quotes';

describe('fetchQuotes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty map (prices null upstream) when the request times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError')),
    );

    const quotes = await fetchQuotes(['PETR4']);

    expect(quotes.size).toBe(0);
    expect(quotes.get('PETR4')).toBeUndefined();
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
      expect.objectContaining({ signal: expect.any(Object) }),
    );
  });

  it('returns an empty map on a generic network error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const quotes = await fetchQuotes(['PETR4']);

    expect(quotes.size).toBe(0);
  });
});
