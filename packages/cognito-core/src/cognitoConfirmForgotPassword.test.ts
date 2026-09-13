import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cognitoConfirmForgotPassword } from './cognitoConfirmForgotPassword';
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

describe('cognitoConfirmForgotPassword (T-108a)', () => {
  it('manda ClientId, Username normalizado, código aparado e a senha nova', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await cognitoConfirmForgotPassword({
      email: ' Alice@Example.com ',
      code: ' 123456 ',
      newPassword: 'senha-nova-1',
    });

    expect(bodyOf(fetchMock)).toEqual({
      ClientId: 'client-abc',
      Username: 'alice@example.com',
      ConfirmationCode: '123456',
      Password: 'senha-nova-1',
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Amz-Target']).toBe(
      'AWSCognitoIdentityProviderService.ConfirmForgotPassword'
    );
  });

  it('pool COM secret: SecretHash na raiz do corpo', async () => {
    process.env.COGNITO_CLIENT_SECRET = 'super-secret';
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await cognitoConfirmForgotPassword({
      email: 'alice@example.com',
      code: '123456',
      newPassword: 'senha-nova-1',
    });
    expect(bodyOf(fetchMock).SecretHash).toBe(
      computeSecretHash({
        username: 'alice@example.com',
        clientId: 'client-abc',
        clientSecret: 'super-secret',
      })
    );
  });

  it('código errado, código vencido e senha fraca são codes DIFERENTES', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'CodeMismatchException' }, 400))
    );
    const wrong = await cognitoConfirmForgotPassword({
      email: 'a@b.com',
      code: '000000',
      newPassword: 'senha-nova-1',
    }).catch((e) => e);
    expect((wrong as CognitoApiError).code).toBe('invalidCode');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'ExpiredCodeException' }, 400))
    );
    const expired = await cognitoConfirmForgotPassword({
      email: 'a@b.com',
      code: '000000',
      newPassword: 'senha-nova-1',
    }).catch((e) => e);
    expect((expired as CognitoApiError).code).toBe('expiredCode');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'InvalidPasswordException' }, 400))
    );
    const weak = await cognitoConfirmForgotPassword({
      email: 'a@b.com',
      code: '123456',
      newPassword: 'fraca',
    }).catch((e) => e);
    expect((weak as CognitoApiError).code).toBe('weakPassword');
  });

  it('e-mail sem cadastro no pool vira userNotFound (a rota é quem mascara)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'UserNotFoundException' }, 400))
    );
    const err = await cognitoConfirmForgotPassword({
      email: 'ninguem@example.com',
      code: '123456',
      newPassword: 'senha-nova-1',
    }).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('userNotFound');
  });

  it('nem o código nem a senha nova aparecem em mensagem de erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'CodeMismatchException' }, 400))
    );
    const err = await cognitoConfirmForgotPassword({
      email: 'a@b.com',
      code: '987654',
      newPassword: 'segredo-super-secreto',
    }).catch((e) => e);
    expect((err as Error).message).not.toContain('987654');
    expect((err as Error).message).not.toContain('segredo-super-secreto');
  });
});
