import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cognitoIdpCall } from './cognitoIdpCall';
import { CognitoApiError } from './CognitoApiError';

function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response;
}

function jsonResponse(body: unknown, status = 200): Response {
  return textResponse(JSON.stringify(body), status);
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

describe('cognitoIdpCall — protocolo AWS JSON 1.1 (T-106)', () => {
  it('POST no endpoint da região com X-Amz-Target e content-type do protocolo', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ UserSub: 'sub-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const payload = await cognitoIdpCall('SignUp', { ClientId: 'client-abc' });
    expect(payload).toEqual({ UserSub: 'sub-1' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cognito-idp.us-east-1.amazonaws.com/');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp',
    });
    expect(JSON.parse(String(init.body))).toEqual({ ClientId: 'client-abc' });
  });

  it('usa a região configurada (não há default de região)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    process.env.COGNITO_REGION = 'sa-east-1';

    await cognitoIdpCall('GetUser', {});
    expect(fetchMock.mock.calls[0][0]).toBe('https://cognito-idp.sa-east-1.amazonaws.com/');
  });

  it('fail closed: sem config não faz request nenhuma', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.COGNITO_CLIENT_ID;

    const err = await cognitoIdpCall('SignUp', {}).catch((e) => e);
    expect(err).toBeInstanceOf(CognitoApiError);
    expect((err as CognitoApiError).code).toBe('configMissing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('corpo vazio em 2xx conta como `{}` (ChangePassword/ConfirmSignUp)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => textResponse('   '))
    );
    expect(await cognitoIdpCall('ChangePassword', {})).toEqual({});
  });

  it('2xx com JSON que não é objeto vira unexpectedResponse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse([1, 2, 3]))
    );
    const err = await cognitoIdpCall('GetUser', {}).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('unexpectedResponse');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('só uma string'))
    );
    const err2 = await cognitoIdpCall('GetUser', {}).catch((e) => e);
    expect((err2 as CognitoApiError).code).toBe('unexpectedResponse');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(null))
    );
    const err3 = await cognitoIdpCall('GetUser', {}).catch((e) => e);
    expect((err3 as CognitoApiError).code).toBe('unexpectedResponse');
  });

  it('2xx com corpo que não é JSON também conta como `{}`', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => textResponse('<html>ops</html>'))
    );
    expect(await cognitoIdpCall('ChangePassword', {})).toEqual({});
  });
});

describe('cognitoIdpCall — traduzindo o erro da AWS (T-106)', () => {
  it('usa o __type do corpo e guarda o status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { __type: 'NotAuthorizedException', message: 'Incorrect username or password.' },
          400
        )
      )
    );

    const err = await cognitoIdpCall('InitiateAuth', {}).catch((e) => e);
    expect(err).toBeInstanceOf(CognitoApiError);
    expect((err as CognitoApiError).code).toBe('invalidCredentials');
    expect((err as CognitoApiError).status).toBe(400);
  });

  it('NÃO deixa a mensagem da AWS vazar para a nossa mensagem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            __type: 'InvalidPasswordException',
            message: 'Password did not conform with policy: Password must have uppercase',
          },
          400
        )
      )
    );

    const err = await cognitoIdpCall('SignUp', {}).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('weakPassword');
    expect((err as Error).message).not.toMatch(/policy/i);
    expect((err as Error).message).toBe('Cognito recusou SignUp (HTTP 400)');
  });

  it('não ecoa o corpo enviado (senha, código, SECRET_HASH) em erro nenhum', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'CodeMismatchException' }, 400))
    );

    const err = await cognitoIdpCall('ConfirmSignUp', {
      Password: 'senha-do-usuario',
      ConfirmationCode: '123456',
      SecretHash: 'hash-secreto',
    }).catch((e) => e);
    expect((err as Error).message).not.toContain('senha-do-usuario');
    expect((err as Error).message).not.toContain('123456');
    expect((err as Error).message).not.toContain('hash-secreto');
  });

  it('429 sem __type legível ainda é throttling', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => textResponse('slow down', 429))
    );
    const err = await cognitoIdpCall('InitiateAuth', {}).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('tooManyRequests');
  });

  it('erro sem __type e sem 429 vira unexpected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'boom' }, 500))
    );
    const err = await cognitoIdpCall('InitiateAuth', {}).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('unexpected');
    expect((err as CognitoApiError).status).toBe(500);
  });

  it('__type não-string é ignorado (cai no unexpected)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 42 }, 400))
    );
    const err = await cognitoIdpCall('InitiateAuth', {}).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('unexpected');
  });

  it('erro com corpo ilegível não derruba a tradução', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => textResponse('<html>gateway</html>', 502))
    );
    const err = await cognitoIdpCall('InitiateAuth', {}).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('unexpected');
    expect((err as CognitoApiError).status).toBe(502);
  });

  it('erro ao LER o corpo não derruba a tradução', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 400,
            text: async () => {
              throw new Error('stream quebrado');
            },
          }) as unknown as Response
      )
    );
    const err = await cognitoIdpCall('InitiateAuth', {}).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('unexpected');
  });

  it('falha de rede vira network, sem carregar o erro original', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET (Password=senha-do-usuario)');
      })
    );

    const err = await cognitoIdpCall('InitiateAuth', { Password: 'senha-do-usuario' }).catch(
      (e) => e
    );
    expect((err as CognitoApiError).code).toBe('network');
    expect((err as Error).message).toBe('Falha de rede ao chamar o Cognito (InitiateAuth)');
    expect((err as Error).message).not.toContain('senha-do-usuario');
  });
});
