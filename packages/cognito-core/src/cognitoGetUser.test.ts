import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cognitoGetUser } from './cognitoGetUser';
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

describe('cognitoGetUser (T-106)', () => {
  it('lê sub e email dos UserAttributes, normalizando o e-mail', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        Username: 'alice@example.com',
        UserAttributes: [
          { Name: 'sub', Value: 'sub-123' },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'email', Value: ' Alice@Example.COM ' },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await cognitoGetUser('access-1')).toEqual({
      sub: 'sub-123',
      email: 'alice@example.com',
      emailVerified: true,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ AccessToken: 'access-1' });
    expect((init.headers as Record<string, string>)['X-Amz-Target']).toBe(
      'AWSCognitoIdentityProviderService.GetUser'
    );
  });

  it('ignora atributo malformado no meio da lista', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          UserAttributes: [
            null,
            'lixo',
            { Name: 'sub' },
            { Name: 'sub', Value: 42 },
            { Name: 'sub', Value: 'sub-123' },
            { Name: 'email', Value: 'alice@example.com' },
          ],
        })
      )
    );
    expect(await cognitoGetUser('access-1')).toEqual({
      sub: 'sub-123',
      email: 'alice@example.com',
      emailVerified: false,
    });
  });

  // email_verified é o que AUTORIZA o vínculo com uma conta que já existe
  // (auth-core/cognitoMirror). Um falso positivo aqui é account takeover, então
  // a leitura é fail closed e o teste percorre os valores que a AWS pode mandar.
  describe('email_verified — fail closed (T-106, achado da revisão)', () => {
    async function emailVerifiedFor(value: unknown): Promise<boolean> {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse({
            UserAttributes: [
              { Name: 'sub', Value: 'sub-123' },
              { Name: 'email', Value: 'alice@example.com' },
              ...(value === undefined ? [] : [{ Name: 'email_verified', Value: value }]),
            ],
          })
        )
      );
      return (await cognitoGetUser('access-1')).emailVerified;
    }

    it('só a string "true" (em qualquer caixa, com espaço) verifica', async () => {
      expect(await emailVerifiedFor('true')).toBe(true);
      expect(await emailVerifiedFor('True')).toBe(true);
      expect(await emailVerifiedFor('  TRUE ')).toBe(true);
    });

    it('atributo ausente conta como NÃO verificado', async () => {
      expect(await emailVerifiedFor(undefined)).toBe(false);
    });

    it('qualquer outro valor conta como NÃO verificado', async () => {
      for (const value of ['false', '1', 'yes', '', 'verdadeiro', true, 1, null]) {
        expect(await emailVerifiedFor(value)).toBe(false);
      }
    });
  });

  it('sem sub ou sem email vira unexpectedResponse', async () => {
    for (const body of [
      {},
      { UserAttributes: 'nope' },
      { UserAttributes: [{ Name: 'sub', Value: 'sub-1' }] },
      { UserAttributes: [{ Name: 'email', Value: 'a@b.com' }] },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(body))
      );
      const err = await cognitoGetUser('access-1').catch((e) => e);
      expect((err as CognitoApiError).code).toBe('unexpectedResponse');
    }
  });

  it('token expirado vira invalidCredentials, sem o token na mensagem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ __type: 'NotAuthorizedException', message: 'Access Token has expired' }, 400)
      )
    );
    const err = await cognitoGetUser('access-secreto').catch((e) => e);
    expect((err as CognitoApiError).code).toBe('invalidCredentials');
    expect((err as Error).message).not.toContain('access-secreto');
  });
});
