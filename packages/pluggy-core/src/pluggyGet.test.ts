import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pluggyGet } from './pluggyGet';
import { PluggyApiError } from './PluggyApiError';
import { _resetPluggyApiKeyCache } from './getPluggyApiKey';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Mock de fetch que responde /auth e delega o resto a `handler`. */
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

describe('pluggyGet (T-087)', () => {
  it('manda a apiKey no header X-API-KEY e devolve o JSON', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ results: [1] }));

    expect(await pluggyGet('/accounts?itemId=item-1')).toEqual({ results: [1] });

    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.pluggy.ai/accounts?itemId=item-1');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe('jwt-abc');
  });

  it('traduz status não-ok em PluggyApiError com o status', async () => {
    stubFetch(() => jsonResponse({ message: 'boom' }, 500));

    const err = await pluggyGet('/accounts?itemId=item-1').catch((e) => e);
    expect(err).toBeInstanceOf(PluggyApiError);
    expect((err as PluggyApiError).status).toBe(500);
    expect((err as Error).message).toContain('HTTP 500');
  });

  it('traduz erro de rede sem vazar a apiKey', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/auth')) return jsonResponse({ apiKey: 'jwt-abc' });
      throw new Error('socket hang up jwt-abc');
    });
    vi.stubGlobal('fetch', fetchMock);

    const err = await pluggyGet('/v2/transactions?accountId=a').catch((e) => e);
    expect(err).toBeInstanceOf(PluggyApiError);
    expect((err as Error).message).not.toContain('jwt-abc');
  });

  it('traduz corpo que não é JSON', async () => {
    stubFetch(
      () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('not json');
          },
        }) as unknown as Response
    );

    await expect(pluggyGet('/accounts?itemId=item-1')).rejects.toThrow(/não é JSON/);
  });
});
