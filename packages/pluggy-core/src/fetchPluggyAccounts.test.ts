import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchPluggyAccounts } from './fetchPluggyAccounts';
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

describe('fetchPluggyAccounts (T-087)', () => {
  it('chama GET /accounts?itemId= e traduz os resultados', async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({
        results: [
          {
            id: 'acc-1',
            type: 'BANK',
            subtype: 'CHECKING_ACCOUNT',
            name: 'CC',
            currencyCode: 'BRL',
          },
          {
            id: 'acc-2',
            type: 'CREDIT',
            subtype: 'CREDIT_CARD',
            name: 'Cartão',
            currencyCode: 'BRL',
          },
        ],
        page: 1,
        total: 2,
        totalPages: 1,
      })
    );

    const accounts = await fetchPluggyAccounts('item-1');
    expect(accounts.map((a) => a.id)).toEqual(['acc-1', 'acc-2']);
    expect(accounts[1].type).toBe('CREDIT');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.pluggy.ai/accounts?itemId=item-1');
  });

  it('recusa itemId vazio antes de qualquer request', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ results: [] }));
    await expect(fetchPluggyAccounts('   ')).rejects.toThrow(/PLUGGY_ITEM_ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('404 do item vira mensagem acionável sobre PLUGGY_ITEM_ID', async () => {
    stubFetch(() => jsonResponse({ message: 'item not found' }, 404));

    const err = await fetchPluggyAccounts('item-inexistente').catch((e) => e);
    expect(err).toBeInstanceOf(PluggyApiError);
    expect((err as PluggyApiError).status).toBe(404);
    expect((err as Error).message).toContain('PLUGGY_ITEM_ID');
    expect((err as Error).message).toContain('item-inexistente');
  });

  it('403 (item de outra aplicação) recebe a mesma orientação', async () => {
    stubFetch(() => jsonResponse({ message: 'forbidden' }, 403));
    await expect(fetchPluggyAccounts('item-de-outro')).rejects.toThrow(/MESMA aplicação/);
  });

  it('outros status sobem como estão', async () => {
    stubFetch(() => jsonResponse({}, 500));
    await expect(fetchPluggyAccounts('item-1')).rejects.toThrow(/HTTP 500/);
  });

  it('recusa envelope sem results', async () => {
    stubFetch(() => jsonResponse({ page: 1 }));
    await expect(fetchPluggyAccounts('item-1')).rejects.toThrow(/sem a lista/);
  });

  it('lista vazia é lista vazia (quem decide falhar é o job)', async () => {
    stubFetch(() => jsonResponse({ results: [] }));
    expect(await fetchPluggyAccounts('item-1')).toEqual([]);
  });
});
