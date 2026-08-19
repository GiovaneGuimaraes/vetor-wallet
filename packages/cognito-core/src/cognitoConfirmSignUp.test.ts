import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cognitoConfirmSignUp } from './cognitoConfirmSignUp';
import { CognitoApiError } from './CognitoApiError';
import { computeSecretHash } from './computeSecretHash';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
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

describe('cognitoConfirmSignUp (T-106)', () => {
  it('manda ClientId, Username normalizado e o código aparado', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await cognitoConfirmSignUp({ email: ' Alice@Example.com ', code: ' 123456 ' });

    expect(bodyOf(fetchMock)).toEqual({
      ClientId: 'client-abc',
      Username: 'alice@example.com',
      ConfirmationCode: '123456',
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Amz-Target']).toBe(
      'AWSCognitoIdentityProviderService.ConfirmSignUp'
    );
  });

  it('pool COM secret: SecretHash na raiz do corpo', async () => {
    process.env.COGNITO_CLIENT_SECRET = 'super-secret';
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await cognitoConfirmSignUp({ email: 'alice@example.com', code: '123456' });
    expect(bodyOf(fetchMock).SecretHash).toBe(
      computeSecretHash({
        username: 'alice@example.com',
        clientId: 'client-abc',
        clientSecret: 'super-secret',
      })
    );
  });

  it('código errado e código vencido são codes DIFERENTES', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'CodeMismatchException' }, 400))
    );
    const wrong = await cognitoConfirmSignUp({ email: 'a@b.com', code: '000000' }).catch((e) => e);
    expect((wrong as CognitoApiError).code).toBe('invalidCode');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'ExpiredCodeException' }, 400))
    );
    const expired = await cognitoConfirmSignUp({ email: 'a@b.com', code: '000000' }).catch(
      (e) => e
    );
    expect((expired as CognitoApiError).code).toBe('expiredCode');
  });

  it('o código não aparece em mensagem de erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'CodeMismatchException' }, 400))
    );
    const err = await cognitoConfirmSignUp({ email: 'a@b.com', code: '987654' }).catch((e) => e);
    expect((err as Error).message).not.toContain('987654');
  });
});
