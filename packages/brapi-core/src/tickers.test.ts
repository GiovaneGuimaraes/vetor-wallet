import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchTickers, getUnknownTickers, _resetCache, _setCache } from './tickers';

const MOCK_STOCKS = [
  { stock: 'PETR3', name: 'Petrobras ON' },
  { stock: 'PETR4', name: 'Petrobras PN' },
  { stock: 'VALE3', name: 'Vale ON' },
  { stock: 'ITUB4', name: 'Itau Unibanco PN' },
];

function mockFetch(stocks = MOCK_STOCKS, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: async () => ({ stocks }),
    }),
  );
}

beforeEach(() => _resetCache());
afterEach(() => vi.unstubAllGlobals());

describe('searchTickers — cache behaviour', () => {
  it('fetches from brapi on first call and caches result', async () => {
    mockFetch();
    await searchTickers('PETR');
    await searchTickers('VALE');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('returns stale cache when brapi fails on second call', async () => {
    mockFetch();
    await searchTickers('PETR');

    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const { results, listAvailable } = await searchTickers('PETR');
    expect(listAvailable).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns listAvailable=false when brapi fails with no cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const { results, listAvailable } = await searchTickers('PETR');
    expect(listAvailable).toBe(false);
    expect(results).toHaveLength(0);
  });

  it('re-fetches after cache TTL expires', async () => {
    mockFetch();
    const expired = Date.now() - 25 * 60 * 60 * 1000;
    _setCache([{ ticker: 'PETR4', name: 'Petrobras PN' }], expired);

    await searchTickers('PETR');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});

describe('searchTickers — filtering', () => {
  beforeEach(() => {
    _setCache(
      MOCK_STOCKS.map((s) => ({ ticker: s.stock, name: s.name })),
      Date.now(),
    );
  });

  it('matches by ticker prefix (case-insensitive)', async () => {
    const { results } = await searchTickers('petr');
    expect(results.map((r) => r.ticker)).toEqual(['PETR3', 'PETR4']);
  });

  it('matches by company name substring', async () => {
    const { results } = await searchTickers('itau');
    expect(results.map((r) => r.ticker)).toEqual(['ITUB4']);
  });

  it('returns empty array when no match', async () => {
    const { results, listAvailable } = await searchTickers('XYZW');
    expect(results).toHaveLength(0);
    expect(listAvailable).toBe(true);
  });
});

describe('getUnknownTickers', () => {
  beforeEach(() => {
    _setCache(
      MOCK_STOCKS.map((s) => ({ ticker: s.stock, name: s.name })),
      Date.now(),
    );
  });

  it('returns tickers not in the list', async () => {
    const unknown = await getUnknownTickers(['PETR4', 'XYZW', 'ABC1']);
    expect(unknown).toEqual(['XYZW', 'ABC1']);
  });

  it('returns empty array when all tickers are known', async () => {
    const unknown = await getUnknownTickers(['PETR4', 'VALE3']);
    expect(unknown).toHaveLength(0);
  });

  it('returns empty array when cache is unavailable', async () => {
    _resetCache();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const unknown = await getUnknownTickers(['XYZW']);
    expect(unknown).toHaveLength(0);
  });
});
