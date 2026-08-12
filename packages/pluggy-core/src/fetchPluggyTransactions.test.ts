import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchPluggyTransactions, MAX_PAGES } from './fetchPluggyTransactions';
import { PluggyApiError } from './PluggyApiError';
import { _resetPluggyApiKeyCache } from './getPluggyApiKey';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function stubFetch(handler: (url: string) => Response) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).endsWith('/auth')) return jsonResponse({ apiKey: 'jwt-abc' });
    return handler(String(url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const tx = (id: string) => ({
  id,
  date: '2026-08-11T00:00:00.000Z',
  description: `tx ${id}`,
  amount: -10,
  type: 'DEBIT',
  currencyCode: 'BRL',
  status: 'POSTED',
});

beforeEach(() => {
  _resetPluggyApiKeyCache();
  process.env.PLUGGY_CLIENT_ID = 'client-id-1';
  process.env.PLUGGY_CLIENT_SECRET = 'secret-1';
  delete process.env.PLUGGY_API_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PLUGGY_CLIENT_ID;
  delete process.env.PLUGGY_CLIENT_SECRET;
});

describe('fetchPluggyTransactions — paginação por cursor (T-087)', () => {
  it('usa /v2/transactions com accountId, dateFrom e dateTo', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ results: [tx('t1')], next: null }));

    await fetchPluggyTransactions({
      accountId: 'acc-1',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });

    const url = String(fetchMock.mock.calls[1][0]);
    expect(url.startsWith('https://api.pluggy.ai/v2/transactions?')).toBe(true);
    expect(url).toContain('accountId=acc-1');
    expect(url).toContain('dateFrom=2026-08-01');
    expect(url).toContain('dateTo=2026-08-12');
    // `from`/`to` são os nomes do endpoint DEPRECADO por página — não usar.
    expect(url).not.toMatch(/[?&]from=/);
    expect(url).not.toMatch(/[?&]to=/);
  });

  it('omite dateFrom/dateTo quando não informados', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ results: [], next: null }));
    await fetchPluggyTransactions({ accountId: 'acc-1' });
    const url = String(fetchMock.mock.calls[1][0]);
    expect(url).toBe('https://api.pluggy.ai/v2/transactions?accountId=acc-1');
  });

  it('segue o cursor `next` por 3 páginas e para quando ele vem null', async () => {
    const pages: Record<string, unknown> = {
      'https://api.pluggy.ai/v2/transactions?accountId=acc-1': {
        results: [tx('t1'), tx('t2')],
        next: '?accountId=acc-1&after=cursor-1',
      },
      'https://api.pluggy.ai/v2/transactions?accountId=acc-1&after=cursor-1': {
        // Página VAZIA no meio: não é fim de paginação — o cursor manda.
        results: [],
        next: '?accountId=acc-1&after=cursor-2',
      },
      'https://api.pluggy.ai/v2/transactions?accountId=acc-1&after=cursor-2': {
        results: [tx('t3')],
        next: null,
      },
    };
    const fetchMock = stubFetch((url) => {
      const body = pages[url];
      if (!body) throw new Error(`URL inesperada: ${url}`);
      return jsonResponse(body);
    });

    const all = await fetchPluggyTransactions({ accountId: 'acc-1' });
    expect(all.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    // 1 auth + 3 páginas
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('aceita `next` como path completo', async () => {
    const fetchMock = stubFetch((url) =>
      url.includes('after=')
        ? jsonResponse({ results: [tx('t2')], next: null })
        : jsonResponse({ results: [tx('t1')], next: '/v2/transactions?accountId=acc-1&after=c1' })
    );

    const all = await fetchPluggyTransactions({ accountId: 'acc-1' });
    expect(all.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(String(fetchMock.mock.calls[2][0])).toBe(
      'https://api.pluggy.ai/v2/transactions?accountId=acc-1&after=c1'
    );
  });

  it('recusa `next` em formato inesperado', async () => {
    stubFetch(() => jsonResponse({ results: [], next: 'cursor-sem-querystring' }));
    await expect(fetchPluggyTransactions({ accountId: 'acc-1' })).rejects.toThrow(
      /formato inesperado/
    );
  });

  it('não trava para sempre: cursor que nunca zera estoura o teto e falha', async () => {
    const fetchMock = stubFetch(() =>
      // `next` SEMPRE preenchido: sem o teto o loop seria infinito.
      jsonResponse({ results: [tx('t')], next: '?accountId=acc-1&after=sempre' })
    );

    const err = await fetchPluggyTransactions({ accountId: 'acc-1' }).catch((e) => e);
    expect(err).toBeInstanceOf(PluggyApiError);
    expect((err as Error).message).toContain(String(MAX_PAGES));
    // 1 auth + MAX_PAGES páginas, e nada além disso.
    expect(fetchMock).toHaveBeenCalledTimes(MAX_PAGES + 1);
  });

  it('recusa accountId vazio antes de qualquer request', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ results: [], next: null }));
    await expect(fetchPluggyTransactions({ accountId: '  ' })).rejects.toThrow(/accountId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recusa envelope sem results', async () => {
    stubFetch(() => jsonResponse({ next: null }));
    await expect(fetchPluggyTransactions({ accountId: 'acc-1' })).rejects.toThrow(/sem a lista/);
  });
});
