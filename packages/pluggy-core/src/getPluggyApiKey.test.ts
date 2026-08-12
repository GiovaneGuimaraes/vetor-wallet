import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPluggyApiKey, _resetPluggyApiKeyCache } from './getPluggyApiKey';
import { PluggyApiError } from './PluggyApiError';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  _resetPluggyApiKeyCache();
  process.env.PLUGGY_CLIENT_ID = 'client-id-1';
  process.env.PLUGGY_CLIENT_SECRET = 'secret-1';
  delete process.env.PLUGGY_API_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.PLUGGY_CLIENT_ID;
  delete process.env.PLUGGY_CLIENT_SECRET;
});

describe('getPluggyApiKey — fluxo de auth (T-087)', () => {
  it('faz POST /auth com clientId/clientSecret e devolve a apiKey', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ apiKey: 'jwt-abc' }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getPluggyApiKey()).toBe('jwt-abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.pluggy.ai/auth');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      clientId: 'client-id-1',
      clientSecret: 'secret-1',
    });
  });

  it('respeita PLUGGY_API_URL', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ apiKey: 'jwt-abc' }));
    vi.stubGlobal('fetch', fetchMock);
    process.env.PLUGGY_API_URL = 'https://sandbox.pluggy.test';

    await getPluggyApiKey();
    expect(fetchMock.mock.calls[0][0]).toBe('https://sandbox.pluggy.test/auth');
  });

  it('exige as duas credenciais e não faz request sem elas', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ apiKey: 'jwt-abc' }));
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.PLUGGY_CLIENT_SECRET;

    await expect(getPluggyApiKey()).rejects.toBeInstanceOf(PluggyApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getPluggyApiKey — cache e expiração (T-087)', () => {
  it('reusa a apiKey entre chamadas (um POST /auth só)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ apiKey: 'jwt-abc' }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getPluggyApiKey()).toBe('jwt-abc');
    expect(await getPluggyApiKey()).toBe('jwt-abc');
    expect(await getPluggyApiKey()).toBe('jwt-abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reautentica depois de 2h (com margem: já vence antes das 2h cheias)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T10:00:00.000Z'));

    let n = 0;
    const fetchMock = vi.fn(async () => jsonResponse({ apiKey: `jwt-${++n}` }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getPluggyApiKey()).toBe('jwt-1');

    // 1h54 depois: ainda dentro da janela (2h - 5min de margem = 1h55).
    vi.setSystemTime(new Date('2026-08-12T11:54:00.000Z'));
    expect(await getPluggyApiKey()).toBe('jwt-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 1h56 depois: a margem de segurança já venceu, mesmo antes das 2h reais.
    vi.setSystemTime(new Date('2026-08-12T11:56:00.000Z'));
    expect(await getPluggyApiKey()).toBe('jwt-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('não reusa a chave de outro clientId', async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => jsonResponse({ apiKey: `jwt-${++n}` }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getPluggyApiKey()).toBe('jwt-1');
    process.env.PLUGGY_CLIENT_ID = 'client-id-2';
    expect(await getPluggyApiKey()).toBe('jwt-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('getPluggyApiKey — falhas (T-087)', () => {
  it('traduz 401 sem ecoar o corpo enviado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'invalid credentials' }, 401))
    );

    const err = await getPluggyApiKey().catch((e) => e);
    expect(err).toBeInstanceOf(PluggyApiError);
    expect((err as PluggyApiError).status).toBe(401);
    expect((err as Error).message).not.toContain('secret-1');
    expect((err as Error).message).not.toContain('client-id-1');
  });

  it('traduz erro de rede', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET (clientSecret=secret-1)');
      })
    );

    const err = await getPluggyApiKey().catch((e) => e);
    expect(err).toBeInstanceOf(PluggyApiError);
    expect((err as Error).message).toBe('Falha de rede ao autenticar na Pluggy');
  });

  it('recusa resposta sem apiKey e resposta não-JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ nope: true }))
    );
    await expect(getPluggyApiKey()).rejects.toThrow(/sem apiKey/);

    _resetPluggyApiKeyCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => {
              throw new Error('not json');
            },
          }) as unknown as Response
      )
    );
    await expect(getPluggyApiKey()).rejects.toThrow(/não é JSON/);
  });

  it('não guarda cache depois de uma falha', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ apiKey: 'jwt-ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPluggyApiKey()).rejects.toBeInstanceOf(PluggyApiError);
    expect(await getPluggyApiKey()).toBe('jwt-ok');
  });
});
