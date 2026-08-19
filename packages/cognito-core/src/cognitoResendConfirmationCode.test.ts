import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cognitoResendConfirmationCode } from './cognitoResendConfirmationCode';
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

describe('cognitoResendConfirmationCode (T-106)', () => {
  it('manda ClientId e Username normalizado, e não devolve o destino mascarado', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        CodeDeliveryDetails: {
          Destination: 'a***@e***.com',
          DeliveryMedium: 'EMAIL',
          AttributeName: 'email',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await cognitoResendConfirmationCode(' Alice@Example.com ');
    expect(result).toBeUndefined();

    expect(bodyOf(fetchMock)).toEqual({ ClientId: 'client-abc', Username: 'alice@example.com' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Amz-Target']).toBe(
      'AWSCognitoIdentityProviderService.ResendConfirmationCode'
    );
  });

  it('pool COM secret: SecretHash na raiz do corpo', async () => {
    process.env.COGNITO_CLIENT_SECRET = 'super-secret';
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await cognitoResendConfirmationCode('alice@example.com');
    expect(bodyOf(fetchMock).SecretHash).toBe(
      computeSecretHash({
        username: 'alice@example.com',
        clientId: 'client-abc',
        clientSecret: 'super-secret',
      })
    );
  });

  it('throttling do Cognito vira tooManyRequests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'LimitExceededException' }, 400))
    );
    const err = await cognitoResendConfirmationCode('a@b.com').catch((e) => e);
    expect((err as CognitoApiError).code).toBe('tooManyRequests');
  });

  it('falha de entrega do e-mail vira codeDeliveryFailure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ __type: 'CodeDeliveryFailureException' }, 400))
    );
    const err = await cognitoResendConfirmationCode('a@b.com').catch((e) => e);
    expect((err as CognitoApiError).code).toBe('codeDeliveryFailure');
  });
});
