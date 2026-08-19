import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cognitoInitiateAuth } from './cognitoInitiateAuth';
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

const OK = {
  AuthenticationResult: {
    AccessToken: 'access-1',
    IdToken: 'id-1',
    RefreshToken: 'refresh-1',
    ExpiresIn: 3600,
  },
};

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

describe('cognitoInitiateAuth — USER_PASSWORD_AUTH (T-106)', () => {
  it('manda o fluxo de senha com USERNAME normalizado e devolve a sessão', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(OK));
    vi.stubGlobal('fetch', fetchMock);

    const session = await cognitoInitiateAuth({
      email: '  Alice@Example.com ',
      password: 'senha-forte-1',
    });
    expect(session).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresInSeconds: 3600,
    });

    expect(bodyOf(fetchMock)).toEqual({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: 'client-abc',
      AuthParameters: { USERNAME: 'alice@example.com', PASSWORD: 'senha-forte-1' },
    });
  });

  it('pool COM secret: SECRET_HASH (caixa alta) DENTRO de AuthParameters', async () => {
    process.env.COGNITO_CLIENT_SECRET = 'super-secret';
    const fetchMock = vi.fn(async () => jsonResponse(OK));
    vi.stubGlobal('fetch', fetchMock);

    await cognitoInitiateAuth({ email: 'alice@example.com', password: 'senha-forte-1' });
    const body = bodyOf(fetchMock);
    expect(body.SecretHash).toBeUndefined();
    expect(body.AuthParameters.SECRET_HASH).toBe(
      computeSecretHash({
        username: 'alice@example.com',
        clientId: 'client-abc',
        clientSecret: 'super-secret',
      })
    );
  });

  it('senha errada vira invalidCredentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { __type: 'NotAuthorizedException', message: 'Incorrect username or password.' },
          400
        )
      )
    );
    const err = await cognitoInitiateAuth({ email: 'a@b.com', password: 'errada' }).catch((e) => e);
    expect((err as CognitoApiError).code).toBe('invalidCredentials');
  });

  it('cadastro não confirmado vira userNotConfirmed (é outra tela, não "senha errada")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'UserNotConfirmedException' }, 400))
    );
    const err = await cognitoInitiateAuth({ email: 'a@b.com', password: 'senha-forte-1' }).catch(
      (e) => e
    );
    expect((err as CognitoApiError).code).toBe('userNotConfirmed');
  });

  it('USER_PASSWORD_AUTH desabilitado no app client vira invalidParameter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { __type: 'InvalidParameterException', message: 'USER_PASSWORD_AUTH flow not enabled' },
          400
        )
      )
    );
    const err = await cognitoInitiateAuth({ email: 'a@b.com', password: 'senha-forte-1' }).catch(
      (e) => e
    );
    expect((err as CognitoApiError).code).toBe('invalidParameter');
  });

  it('MFA (ChallengeName) vira challengeRequired em vez de sessão sem token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ChallengeName: 'SMS_MFA', Session: 'sess-1' }))
    );
    const err = await cognitoInitiateAuth({ email: 'a@b.com', password: 'senha-forte-1' }).catch(
      (e) => e
    );
    expect((err as CognitoApiError).code).toBe('challengeRequired');
  });
});
