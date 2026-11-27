import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMarketList } from './fetchMarketList';
import { getMarketUniverse, _resetMarketCache, MARKET_CACHE_TTL_MS } from './getMarketUniverse';

const payload = {
  stocks: [
    {
      stock: 'AAAA3',
      name: 'Empresa A',
      close: 10.5,
      change: 2.1,
      volume: 1000,
      market_cap: 5e9,
      sector: 'Finance',
    },
    { stock: 'BBBB4', close: 3, change: 0, volume: 5, market_cap: null, sector: null },
    { stock: 'BAD', close: null, change: 1, volume: 1 },
    { name: 'sem ticker', close: 1, change: 1, volume: 1 },
  ],
};

const okFetch = () => vi.fn(async () => new Response(JSON.stringify(payload)));
const failFetch = () => vi.fn(async () => new Response('x', { status: 503 }));

describe('fetchMarketList', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('traduz a lista, descarta linhas inválidas e não envia token', async () => {
    process.env.BRAPI_TOKEN = 'segredo';
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    const list = await fetchMarketList();
    expect(list).toEqual([
      {
        ticker: 'AAAA3',
        name: 'Empresa A',
        close: 10.5,
        change: 2.1,
        volume: 1000,
        marketCap: 5e9,
        sector: 'Finance',
      },
      {
        ticker: 'BBBB4',
        name: 'BBBB4',
        close: 3,
        change: 0,
        volume: 5,
        marketCap: null,
        sector: null,
      },
    ]);
    const url = String(f.mock.calls[0]![0]);
    expect(url).toContain('/quote/list?type=stock');
    expect(url).not.toContain('token');
    delete process.env.BRAPI_TOKEN;
  });

  it('lança em status não-ok', async () => {
    vi.stubGlobal('fetch', failFetch());
    await expect(fetchMarketList()).rejects.toThrow('brapi responded with 503');
  });

  it('payload sem `stocks` vira lista vazia', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}'))
    );
    expect(await fetchMarketList()).toEqual([]);
  });
});

describe('getMarketUniverse', () => {
  beforeEach(() => _resetMarketCache());
  afterEach(() => vi.unstubAllGlobals());

  it('usa o cache dentro do TTL e refaz o fetch depois dele', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    const a = await getMarketUniverse(1000);
    await getMarketUniverse(1000 + MARKET_CACHE_TTL_MS - 1);
    expect(f).toHaveBeenCalledTimes(1);
    const b = await getMarketUniverse(1000 + MARKET_CACHE_TTL_MS);
    expect(f).toHaveBeenCalledTimes(2);
    expect(a.fetchedAt).toBe(1000);
    expect(b.fetchedAt).toBe(1000 + MARKET_CACHE_TTL_MS);
  });

  it('com a brapi fora, devolve o cache vencido com o fetchedAt original', async () => {
    vi.stubGlobal('fetch', okFetch());
    await getMarketUniverse(1000);
    vi.stubGlobal('fetch', failFetch());
    const stale = await getMarketUniverse(1000 + MARKET_CACHE_TTL_MS * 2);
    expect(stale.fetchedAt).toBe(1000);
    expect(stale.quotes).toHaveLength(2);
  });

  it('chamadas concorrentes com cache frio compartilham uma só requisição', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    const [a, b] = await Promise.all([getMarketUniverse(1000), getMarketUniverse(1000)]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('sem cache e com a brapi fora, lança', async () => {
    vi.stubGlobal('fetch', failFetch());
    await expect(getMarketUniverse()).rejects.toThrow();
  });
});
