import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cognitoChangePassword } from './cognitoChangePassword';
import { CognitoApiError } from './CognitoApiError';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  process.env.COGNITO_REGION = 'us-east-1';
  process.env.COGNITO_USER_POOL_ID = 'us-east-1_TESTPOOL';
  process.env.COGNITO_CLIENT_ID = 'client-abc';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.COGNITO_REGION;
  delete process.env.COGNITO_USER_POOL_ID;
  delete process.env.COGNITO_CLIENT_ID;
});

describe('cognitoChangePassword (T-106)', () => {
  it('manda access token + senha atual + nova, e nada de ClientId/SecretHash', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await cognitoChangePassword({
      accessToken: 'access-1',
      currentPassword: 'senha-atual',
      newPassword: 'senha-nova-1',
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      AccessToken: 'access-1',
      PreviousPassword: 'senha-atual',
      ProposedPassword: 'senha-nova-1',
    });
    expect((init.headers as Record<string, string>)['X-Amz-Target']).toBe(
      'AWSCognitoIdentityProviderService.ChangePassword'
    );
  });

  it('senha atual errada OU token expirado: os dois chegam como invalidCredentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { __type: 'NotAuthorizedException', message: 'Incorrect username or password.' },
          400
        )
      )
    );
    const err = await cognitoChangePassword({
      accessToken: 'access-1',
      currentPassword: 'errada',
      newPassword: 'senha-nova-1',
    }).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('invalidCredentials');
  });

  it('senha nova fora da política vira weakPassword', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'InvalidPasswordException' }, 400))
    );
    const err = await cognitoChangePassword({
      accessToken: 'access-1',
      currentPassword: 'senha-atual',
      newPassword: 'fraca',
    }).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('weakPassword');
  });

  it('nem token nem senhas aparecem em mensagem de erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      })
    );
    const err = await cognitoChangePassword({
      accessToken: 'access-secreto',
      currentPassword: 'senha-atual',
      newPassword: 'senha-nova-1',
    }).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('network');
    expect((err as Error).message).not.toContain('access-secreto');
    expect((err as Error).message).not.toContain('senha-atual');
    expect((err as Error).message).not.toContain('senha-nova-1');
  });
});
