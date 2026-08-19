import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cognitoSignUp } from './cognitoSignUp';
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

describe('cognitoSignUp (T-106)', () => {
  it('manda ClientId, Username e o atributo email — sem SecretHash em pool sem secret', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ UserSub: 'sub-1', UserConfirmed: false }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await cognitoSignUp({ email: 'alice@example.com', password: 'senha-forte-1' });
    expect(result).toEqual({ userSub: 'sub-1', userConfirmed: false });

    expect(bodyOf(fetchMock)).toEqual({
      ClientId: 'client-abc',
      Username: 'alice@example.com',
      Password: 'senha-forte-1',
      UserAttributes: [{ Name: 'email', Value: 'alice@example.com' }],
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Amz-Target']).toBe(
      'AWSCognitoIdentityProviderService.SignUp'
    );
  });

  it('normaliza o e-mail (caixa e espaços) no Username e no atributo', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ UserSub: 'sub-1', UserConfirmed: true }));
    vi.stubGlobal('fetch', fetchMock);

    await cognitoSignUp({ email: '  Alice@Example.COM ', password: 'senha-forte-1' });
    const body = bodyOf(fetchMock);
    expect(body.Username).toBe('alice@example.com');
    expect(body.UserAttributes).toEqual([{ Name: 'email', Value: 'alice@example.com' }]);
  });

  it('pool COM client secret: SecretHash sobre o e-mail normalizado', async () => {
    process.env.COGNITO_CLIENT_SECRET = 'super-secret';
    const fetchMock = vi.fn(async () => jsonResponse({ UserSub: 'sub-1', UserConfirmed: true }));
    vi.stubGlobal('fetch', fetchMock);

    await cognitoSignUp({ email: 'Alice@Example.com', password: 'senha-forte-1' });
    expect(bodyOf(fetchMock).SecretHash).toBe(
      computeSecretHash({
        username: 'alice@example.com',
        clientId: 'client-abc',
        clientSecret: 'super-secret',
      })
    );
  });

  it('devolve userConfirmed=true quando o pool não pede confirmação', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ UserSub: 'sub-9', UserConfirmed: true }))
    );
    expect(await cognitoSignUp({ email: 'a@b.com', password: 'senha-forte-1' })).toEqual({
      userSub: 'sub-9',
      userConfirmed: true,
    });
  });

  it('e-mail já cadastrado vira emailAlreadyExists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'UsernameExistsException' }, 400))
    );
    const err = await cognitoSignUp({ email: 'a@b.com', password: 'senha-forte-1' }).catch(
      (e) => e
    );
    expect((err as CognitoApiError).code).toBe('emailAlreadyExists');
  });

  it('senha fraca vira weakPassword, sem a política do pool na mensagem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { __type: 'InvalidPasswordException', message: 'Password must have symbols' },
          400
        )
      )
    );
    const err = await cognitoSignUp({ email: 'a@b.com', password: 'fraca' }).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('weakPassword');
    expect((err as Error).message).not.toMatch(/symbols/);
  });

  it('resposta sem UserSub/UserConfirmed vira unexpectedResponse', async () => {
    for (const body of [
      { UserConfirmed: true },
      { UserSub: '  ', UserConfirmed: true },
      { UserSub: 'sub-1' },
      { UserSub: 'sub-1', UserConfirmed: 'yes' },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(body))
      );
      const err = await cognitoSignUp({ email: 'a@b.com', password: 'senha-forte-1' }).catch(
        (e) => e
      );
      expect((err as CognitoApiError).code).toBe('unexpectedResponse');
    }
  });

  it('a senha nunca aparece em mensagem de erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('rede caiu');
      })
    );
    const err = await cognitoSignUp({ email: 'a@b.com', password: 'senha-do-usuario' }).catch(
      (e) => e
    );
    expect((err as Error).message).not.toContain('senha-do-usuario');
  });
});
