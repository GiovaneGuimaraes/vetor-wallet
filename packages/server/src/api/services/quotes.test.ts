import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchQuotes } from './quotes';

describe('fetchQuotes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty map and failed=true (prices null upstream) when the request times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError')),
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
      expect.objectContaining({ signal: expect.any(Object) }),
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
      }),
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
});
