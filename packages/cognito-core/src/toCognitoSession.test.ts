import { describe, it, expect } from 'vitest';
import { toCognitoSession } from './toCognitoSession';
import { CognitoApiError } from './CognitoApiError';

describe('toCognitoSession (T-106)', () => {
  it('extrai access token, refresh token e validade', () => {
    expect(
      toCognitoSession({
        AuthenticationResult: {
          AccessToken: 'access-1',
          IdToken: 'id-1',
          RefreshToken: 'refresh-1',
          ExpiresIn: 3600,
          TokenType: 'Bearer',
        },
      })
    ).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresInSeconds: 3600 });
  });

  it('refresh token ausente vira null (é o caso do próprio fluxo de refresh)', () => {
    expect(
      toCognitoSession({ AuthenticationResult: { AccessToken: 'access-2', ExpiresIn: 3600 } })
    ).toEqual({ accessToken: 'access-2', refreshToken: null, expiresInSeconds: 3600 });

    expect(
      toCognitoSession({
        AuthenticationResult: { AccessToken: 'access-2', RefreshToken: '  ', ExpiresIn: 3600 },
      }).refreshToken
    ).toBeNull();
  });

  it('ExpiresIn ausente ou inválido vira 0 em vez de NaN', () => {
    expect(toCognitoSession({ AuthenticationResult: { AccessToken: 'a' } }).expiresInSeconds).toBe(
      0
    );
    expect(
      toCognitoSession({ AuthenticationResult: { AccessToken: 'a', ExpiresIn: 'muito' } })
        .expiresInSeconds
    ).toBe(0);
    expect(
      toCognitoSession({ AuthenticationResult: { AccessToken: 'a', ExpiresIn: Number.NaN } })
        .expiresInSeconds
    ).toBe(0);
  });

  it('ChallengeName é erro tipado, não "sem token"', () => {
    const err = (() => {
      try {
        toCognitoSession({ ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 'sess' });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(CognitoApiError);
    expect((err as CognitoApiError).code).toBe('challengeRequired');
    expect((err as Error).message).toContain('SOFTWARE_TOKEN_MFA');
  });

  it('ChallengeName vazio/não-string não conta como desafio', () => {
    expect(
      toCognitoSession({
        ChallengeName: '  ',
        AuthenticationResult: { AccessToken: 'a', ExpiresIn: 1 },
      }).accessToken
    ).toBe('a');
    expect(
      toCognitoSession({
        ChallengeName: 7,
        AuthenticationResult: { AccessToken: 'a', ExpiresIn: 1 },
      }).accessToken
    ).toBe('a');
  });

  it('sem AuthenticationResult e sem AccessToken: unexpectedResponse', () => {
    for (const payload of [
      {},
      { AuthenticationResult: null },
      { AuthenticationResult: 'nope' },
      { AuthenticationResult: {} },
      { AuthenticationResult: { AccessToken: '   ' } },
      { AuthenticationResult: { AccessToken: 42 } },
    ]) {
      const err = (() => {
        try {
          toCognitoSession(payload as Record<string, unknown>);
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect((err as CognitoApiError).code).toBe('unexpectedResponse');
    }
  });

  it('nenhum token entra na mensagem de erro', () => {
    const err = (() => {
      try {
        toCognitoSession({ AuthenticationResult: { RefreshToken: 'refresh-secreto' } });
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err?.message).not.toContain('refresh-secreto');
  });
});
