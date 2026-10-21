import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchPluggyInvestments,
  MAX_INVESTMENT_PAGES,
  PLUGGY_INVESTMENTS_PAGE_SIZE,
} from './fetchPluggyInvestments';
import { PluggyApiError } from './PluggyApiError';
import { _resetPluggyApiKeyCache } from './getPluggyApiKey';

// Fixtures sintéticas: valores redondos e nomes genéricos, nada com cara de
// carteira real (o repo é público — ver CLAUDE.md da raiz).

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function stubFetch(handler: (url: URL) => Response) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).endsWith('/auth')) return jsonResponse({ apiKey: 'jwt-abc' });
    return handler(new URL(String(url)));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Só as chamadas a /investments (descarta a de /auth). */
function investmentCalls(fetchMock: ReturnType<typeof stubFetch>): URL[] {
  return fetchMock.mock.calls
    .map((c) => new URL(String(c[0])))
    .filter((u) => u.pathname === '/investments');
}

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

describe('fetchPluggyInvestments (T-091d, fatia d1)', () => {
  it('chama GET /investments com itemId, page e pageSize e traduz vários tipos', async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({
        page: 1,
        total: 4,
        totalPages: 1,
        results: [
          { id: 'inv-1', type: 'FIXED_INCOME', subtype: 'CDB', balance: 100 },
          { id: 'inv-2', type: 'EQUITY', balance: 200 },
          { id: 'inv-3', type: 'MUTUAL_FUND', subtype: 'MULTIMARKET_FUND' },
          { id: 'inv-4', type: 'ETF' },
        ],
      })
    );

    const result = await fetchPluggyInvestments('item-1');
    expect(result.map((i) => i.type)).toEqual(['FIXED_INCOME', 'EQUITY', 'MUTUAL_FUND', 'ETF']);
    expect(result[0]).toMatchObject({ id: 'inv-1', subtype: 'CDB', balance: 100 });

    const [call] = investmentCalls(fetchMock);
    expect(call.origin).toBe('https://api.pluggy.ai');
    expect(call.searchParams.get('itemId')).toBe('item-1');
    expect(call.searchParams.get('page')).toBe('1');
    expect(call.searchParams.get('pageSize')).toBe(String(PLUGGY_INVESTMENTS_PAGE_SIZE));
  });

  it('tipo desconhecido entra no resultado como veio, sem ser descartado', async () => {
    stubFetch(() =>
      jsonResponse({
        page: 1,
        totalPages: 1,
        results: [{ id: 'inv-x', type: 'TIPO_NOVO_DA_PLUGGY' }, { id: 'inv-y' }],
      })
    );

    const result = await fetchPluggyInvestments('item-1');
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('TIPO_NOVO_DA_PLUGGY');
    expect(result[1].type).toBeNull();
  });

  it('segue as páginas até totalPages, inclusive com página vazia no meio', async () => {
    const pages: Record<string, unknown[]> = {
      '1': [{ id: 'inv-1', type: 'FIXED_INCOME' }],
      '2': [],
      '3': [{ id: 'inv-3', type: 'COE' }],
    };
    const fetchMock = stubFetch((url) => {
      const page = url.searchParams.get('page') ?? '';
      return jsonResponse({ page: Number(page), total: 2, totalPages: 3, results: pages[page] });
    });

    const result = await fetchPluggyInvestments('item-1');
    expect(result.map((i) => i.id)).toEqual(['inv-1', 'inv-3']);
    expect(investmentCalls(fetchMock).map((u) => u.searchParams.get('page'))).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('envelope vazio (totalPages 0) devolve lista vazia com uma só request', async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({ page: 1, total: 0, totalPages: 0, results: [] })
    );
    expect(await fetchPluggyInvestments('item-1')).toEqual([]);
    expect(investmentCalls(fetchMock)).toHaveLength(1);
  });

  it('recusa itemId vazio antes de qualquer request', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ results: [], totalPages: 0 }));
    await expect(fetchPluggyInvestments('  ')).rejects.toBeInstanceOf(PluggyApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('status não-ok sobe como PluggyApiError com o status', async () => {
    stubFetch(() => jsonResponse({}, 500));
    const err = await fetchPluggyInvestments('item-1').catch((e) => e);
    expect(err).toBeInstanceOf(PluggyApiError);
    expect((err as PluggyApiError).status).toBe(500);
  });

  it('404/403 vira mensagem acionável SEM o itemId (credencial portadora)', async () => {
    for (const status of [404, 403]) {
      _resetPluggyApiKeyCache();
      stubFetch(() => jsonResponse({ message: 'not found' }, status));
      const err = await fetchPluggyInvestments('item-secreto-123').catch((e) => e);
      expect(err).toBeInstanceOf(PluggyApiError);
      expect((err as PluggyApiError).status).toBe(status);
      expect((err as Error).message).toContain('MESMA aplicação');
      expect((err as Error).message).not.toContain('item-secreto-123');
    }
  });

  it('erro de rede vira PluggyApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/auth')) return jsonResponse({ apiKey: 'jwt-abc' });
        throw new TypeError('fetch failed');
      })
    );
    await expect(fetchPluggyInvestments('item-1')).rejects.toThrow(/Falha de rede/);
  });

  it('recusa envelope sem results', async () => {
    stubFetch(() => jsonResponse({ page: 1, totalPages: 1 }));
    await expect(fetchPluggyInvestments('item-1')).rejects.toThrow(/sem a lista/);
  });

  it('recusa envelope sem totalPages válido em vez de assumir página única', async () => {
    for (const totalPages of [undefined, null, '1', 1.5, -1]) {
      stubFetch(() => jsonResponse({ results: [], totalPages }));
      await expect(fetchPluggyInvestments('item-1')).rejects.toThrow(/totalPages/);
    }
  });

  it('totalPages acima do teto falha alto antes de paginar', async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({ results: [], totalPages: MAX_INVESTMENT_PAGES + 1 })
    );
    await expect(fetchPluggyInvestments('item-1')).rejects.toThrow(/teto/);
    expect(investmentCalls(fetchMock)).toHaveLength(1);
  });
});
