import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cognitoRefreshSession } from './cognitoRefreshSession';
import { CognitoApiError } from './CognitoApiError';
import { computeSecretHash } from './computeSecretHash';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>): Record<string, any> {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  process.env.COGNITO_REGION = 'us-east-1';
  process.env.COGNITO_USER_POOL_ID = 'us-east-1_TESTPOOL';
  process.env.COGNITO_CLIENT_ID = 'client-abc';
  delete process.env.COGNITO_CLIENT_SECRET;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.COGNITO_REGION;
  delete process.env.COGNITO_USER_POOL_ID;
  delete process.env.COGNITO_CLIENT_ID;
  delete process.env.COGNITO_CLIENT_SECRET;
});

describe('cognitoRefreshSession — REFRESH_TOKEN_AUTH (T-106)', () => {
  it('troca o refresh token por um access token novo; refreshToken volta null', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ AuthenticationResult: { AccessToken: 'access-2', ExpiresIn: 3600 } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = await cognitoRefreshSession({
      refreshToken: 'refresh-1',
      username: 'Alice@Example.com',
    });
    expect(session).toEqual({
      accessToken: 'access-2',
      refreshToken: null,
      expiresInSeconds: 3600,
    });

    expect(bodyOf(fetchMock)).toEqual({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: 'client-abc',
      AuthParameters: { REFRESH_TOKEN: 'refresh-1' },
    });
  });

  it('pool COM secret: SECRET_HASH sobre o username normalizado', async () => {
    process.env.COGNITO_CLIENT_SECRET = 'super-secret';
    const fetchMock = vi.fn(async () =>
      jsonResponse({ AuthenticationResult: { AccessToken: 'access-2', ExpiresIn: 3600 } })
    );
    vi.stubGlobal('fetch', fetchMock);

    await cognitoRefreshSession({ refreshToken: 'refresh-1', username: ' Alice@Example.com ' });
    expect(bodyOf(fetchMock).AuthParameters.SECRET_HASH).toBe(
      computeSecretHash({
        username: 'alice@example.com',
        clientId: 'client-abc',
        clientSecret: 'super-secret',
      })
    );
  });

  it('refresh token revogado/expirado vira invalidCredentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { __type: 'NotAuthorizedException', message: 'Refresh Token has expired' },
          400
        )
      )
    );
    const err = await cognitoRefreshSession({
      refreshToken: 'refresh-velho',
      username: 'a@b.com',
    }).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('invalidCredentials');
    expect((err as Error).message).not.toContain('refresh-velho');
  });
});
