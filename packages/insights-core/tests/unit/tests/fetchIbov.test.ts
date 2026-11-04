import { fetchIbovespaReturn } from 'src/fetchIbovespaReturn';
import { fetchIbovespaSeries } from 'src/fetchIbovespaSeries';

function mockFetch(impl: () => unknown) {
  const fn = jest.fn(async () => impl());
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}
const ok = (history: unknown) => ({
  ok: true,
  json: async () => ({ results: [{ historicalDataPrice: history }] }),
});
const throwing = () => {
  throw new Error('boom');
};
const ts = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime() / 1000;
const originalToken = process.env.BRAPI_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.BRAPI_TOKEN;
  else process.env.BRAPI_TOKEN = originalToken;
});

describe('fetchIbovespaReturn', () => {
  it('retorno percentual do ponto de partida ao último, e envia o token quando há', async () => {
    process.env.BRAPI_TOKEN = 'tok';
    const fn = mockFetch(() =>
      ok([
        { date: ts('2026-03-01'), close: 120 },
        { date: ts('2026-01-01'), close: 100 },
        { date: ts('2026-02-01'), close: 110 },
      ])
    );
    expect(await fetchIbovespaReturn('2026-01-15')).toBeCloseTo(((120 - 110) / 110) * 100, 8);
    expect((fn.mock.calls[0] as unknown[])[0]).toContain('&token=tok');
  });

  it('sem ponto >= from usa o primeiro; sem token não anexa o parâmetro', async () => {
    delete process.env.BRAPI_TOKEN;
    const fn = mockFetch(() =>
      ok([
        { date: ts('2026-01-01'), close: 100 },
        { date: ts('2026-02-01'), close: 150 },
      ])
    );
    expect(await fetchIbovespaReturn('2027-01-01')).toBeCloseTo(50, 8);
    expect((fn.mock.calls[0] as unknown[])[0]).not.toContain('token');
  });

  it('null com HTTP ruim, histórico ausente/curto, close zerado ou erro', async () => {
    mockFetch(() => ({ ok: false }));
    expect(await fetchIbovespaReturn('2026-01-01')).toBeNull();
    mockFetch(() => ({ ok: true, json: async () => ({}) }));
    expect(await fetchIbovespaReturn('2026-01-01')).toBeNull();
    mockFetch(() => ok([{ date: ts('2026-01-01'), close: 100 }]));
    expect(await fetchIbovespaReturn('2026-01-01')).toBeNull();
    mockFetch(() =>
      ok([
        { date: ts('2026-01-01'), close: 0 },
        { date: ts('2026-02-01'), close: 100 },
      ])
    );
    expect(await fetchIbovespaReturn('2026-01-01')).toBeNull();
    mockFetch(throwing);
    expect(await fetchIbovespaReturn('2026-01-01')).toBeNull();
  });
});

describe('fetchIbovespaSeries', () => {
  it('recorta a janela, usa o range da janela e anexa o token', async () => {
    process.env.BRAPI_TOKEN = 'tok';
    const fn = mockFetch(() =>
      ok([
        { date: ts('2026-01-02'), close: 100 },
        { date: ts('2026-01-10'), close: 110 },
      ])
    );
    const series = await fetchIbovespaSeries('2026-01-05', '2026-01-31', 30);
    expect(series).toEqual([{ date: '2026-01-10', value: 110 }]);
    const url = (fn.mock.calls[0] as unknown[])[0] as string;
    expect(url).toContain('range=3mo');
    expect(url).toContain('&token=tok');
  });

  it('sem token não anexa o parâmetro', async () => {
    delete process.env.BRAPI_TOKEN;
    const fn = mockFetch(() => ok([{ date: ts('2026-01-10'), close: 110 }]));
    await fetchIbovespaSeries('2026-01-05', '2026-01-31', 30);
    expect((fn.mock.calls[0] as unknown[])[0]).not.toContain('token');
  });

  it('null com HTTP ruim, histórico ausente/vazio, janela sem ponto ou erro', async () => {
    mockFetch(() => ({ ok: false }));
    expect(await fetchIbovespaSeries('2026-01-05', '2026-01-31', 30)).toBeNull();
    mockFetch(() => ({ ok: true, json: async () => ({}) }));
    expect(await fetchIbovespaSeries('2026-01-05', '2026-01-31', 30)).toBeNull();
    mockFetch(() => ok([]));
    expect(await fetchIbovespaSeries('2026-01-05', '2026-01-31', 30)).toBeNull();
    mockFetch(() => ok([{ date: ts('2025-01-10'), close: 110 }]));
    expect(await fetchIbovespaSeries('2026-01-05', '2026-01-31', 30)).toBeNull();
    mockFetch(throwing);
    expect(await fetchIbovespaSeries('2026-01-05', '2026-01-31', 30)).toBeNull();
  });
});
