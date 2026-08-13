import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pluggySend } from './pluggySend';
import { createPluggyConnectToken } from './createPluggyConnectToken';
import { deletePluggyItem } from './deletePluggyItem';
import { PluggyApiError } from './PluggyApiError';
import { _resetPluggyApiKeyCache } from './getPluggyApiKey';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function noContent(): Response {
  return {
    ok: true,
    status: 204,
    json: async () => {
      throw new Error('204 não tem corpo');
    },
  } as unknown as Response;
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/auth')) return jsonResponse({ apiKey: 'jwt-abc' });
    return handler(String(url), init);
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

describe('pluggySend (T-089b)', () => {
  it('manda a apiKey no header e serializa o corpo', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ ok: true }));
    await pluggySend('POST', '/connect_token', { clientUserId: '7' });

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api.pluggy.ai/connect_token');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['X-API-KEY']).toBe('jwt-abc');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({ clientUserId: '7' });
  });

  it('sem corpo não manda Content-Type nem body (caso do DELETE)', async () => {
    const fetchMock = stubFetch(() => noContent());
    await pluggySend('DELETE', '/items/abc');

    const [, init] = fetchMock.mock.calls[1];
    expect(init?.body).toBeUndefined();
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('204 devolve null em vez de tentar parsear corpo vazio', async () => {
    stubFetch(() => noContent());
    await expect(pluggySend('DELETE', '/items/abc')).resolves.toBeNull();
  });

  it('status não-ok vira PluggyApiError com o status', async () => {
    stubFetch(() => jsonResponse({ message: 'nope' }, 403));
    await expect(pluggySend('POST', '/connect_token', {})).rejects.toMatchObject({
      status: 403,
    });
  });

  it('a mensagem de erro não carrega o corpo enviado nem a apiKey', async () => {
    stubFetch(() => jsonResponse({}, 500));
    const err = await pluggySend('POST', '/connect_token', {
      clientUserId: 'segredo-do-usuario',
    }).catch((e: unknown) => e as Error);

    expect(err.message).not.toContain('segredo-do-usuario');
    expect(err.message).not.toContain('jwt-abc');
  });

  it('falha de rede não vaza o `cause` (que carrega a request)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/auth')) return jsonResponse({ apiKey: 'jwt-abc' });
        throw new Error('ECONNRESET com corpo secreto');
      })
    );
    const err = await pluggySend('POST', '/x', {}).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(PluggyApiError);
    expect(err.message).not.toContain('secreto');
  });
});

describe('createPluggyConnectToken (T-089b)', () => {
  it('devolve o accessToken', async () => {
    stubFetch(() => jsonResponse({ accessToken: 'tok-123' }));
    await expect(createPluggyConnectToken({ clientUserId: '7' })).resolves.toBe('tok-123');
  });

  it('com itemId pede token de REAUTENTICAÇÃO daquela conexão', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ accessToken: 'tok-123' }));
    await createPluggyConnectToken({ clientUserId: '7', itemId: 'item-9' });

    // Sem o itemId no corpo, renovar credencial criaria um SEGUNDO item para o
    // mesmo banco — e ele reimportaria tudo.
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      itemId: 'item-9',
      options: { clientUserId: '7' },
    });
  });

  it('sem itemId o corpo não traz a chave (conexão nova)', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ accessToken: 'tok-123' }));
    await createPluggyConnectToken({ clientUserId: '7', itemId: '   ' });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      options: { clientUserId: '7' },
    });
  });

  it('recusa clientUserId vazio sem chamar a Pluggy', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ accessToken: 'x' }));
    await expect(createPluggyConnectToken({ clientUserId: '  ' })).rejects.toBeInstanceOf(
      PluggyApiError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resposta sem accessToken é erro, não token vazio', async () => {
    stubFetch(() => jsonResponse({ nope: true }));
    await expect(createPluggyConnectToken({ clientUserId: '7' })).rejects.toBeInstanceOf(
      PluggyApiError
    );
  });
});

describe('deletePluggyItem (T-089b)', () => {
  it('chama DELETE /items/{id} com o id escapado', async () => {
    const fetchMock = stubFetch(() => noContent());
    await deletePluggyItem('item/9');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.pluggy.ai/items/item%2F9');
  });

  it('404 conta como sucesso — o item já não existe lá', async () => {
    // Erro aqui deixaria a linha órfã no nosso banco, sem saída pela UI.
    stubFetch(() => jsonResponse({ message: 'not found' }, 404));
    await expect(deletePluggyItem('item-9')).resolves.toBeUndefined();
  });

  it('mas 500 continua sendo erro — não apagamos o vínculo às cegas', async () => {
    stubFetch(() => jsonResponse({}, 500));
    await expect(deletePluggyItem('item-9')).rejects.toBeInstanceOf(PluggyApiError);
  });
});
