import { fetchCDIAccumulated } from 'src/fetchCDIAccumulated';
import { fetchCdiSeries } from 'src/fetchCdiSeries';

function mockFetch(impl: () => unknown) {
  const fn = jest.fn(async () => impl());
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}
const ok = (body: unknown) => ({ ok: true, json: async () => body });
const throwing = () => {
  throw new Error('boom');
};

describe('fetchCDIAccumulated', () => {
  it('acumula as taxas diárias em percentual e monta a URL em dd/mm/yyyy', async () => {
    const fn = mockFetch(() =>
      ok([
        { data: '02/01/2026', valor: '0,10' },
        { data: '05/01/2026', valor: '0,10' },
      ])
    );
    const pct = await fetchCDIAccumulated('2026-01-02', '2026-01-05');
    expect(pct).toBeCloseTo((1.001 * 1.001 - 1) * 100, 8);
    expect((fn.mock.calls[0] as unknown[])[0]).toContain(
      'dataInicial=02/01/2026&dataFinal=05/01/2026'
    );
  });

  it('null quando a resposta não é ok, vem vazia ou o fetch falha', async () => {
    mockFetch(() => ({ ok: false }));
    expect(await fetchCDIAccumulated('2026-01-02', '2026-01-05')).toBeNull();
    mockFetch(() => ok([]));
    expect(await fetchCDIAccumulated('2026-01-02', '2026-01-05')).toBeNull();
    mockFetch(throwing);
    expect(await fetchCDIAccumulated('2026-01-02', '2026-01-05')).toBeNull();
  });
});

describe('fetchCdiSeries', () => {
  it('devolve a série acumulada', async () => {
    mockFetch(() => ok([{ data: '02/01/2026', valor: '0,05' }]));
    const series = await fetchCdiSeries('2026-01-02', '2026-01-05');
    expect(series).toHaveLength(1);
    expect(series?.[0].date).toBe('2026-01-02');
  });

  it('null em HTTP ruim, não-array, vazio, só linhas inválidas e erro', async () => {
    mockFetch(() => ({ ok: false }));
    expect(await fetchCdiSeries('2026-01-02', '2026-01-05')).toBeNull();
    mockFetch(() => ok({ erro: true }));
    expect(await fetchCdiSeries('2026-01-02', '2026-01-05')).toBeNull();
    mockFetch(() => ok([]));
    expect(await fetchCdiSeries('2026-01-02', '2026-01-05')).toBeNull();
    mockFetch(() => ok([{ data: 'x', valor: '1' }]));
    expect(await fetchCdiSeries('2026-01-02', '2026-01-05')).toBeNull();
    mockFetch(throwing);
    expect(await fetchCdiSeries('2026-01-02', '2026-01-05')).toBeNull();
  });
});
