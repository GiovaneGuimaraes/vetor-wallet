import { CognitoApiError } from './CognitoApiError';

export interface CognitoSession {
  /** Access token do usuário. É a credencial de `GetUser` e `ChangePassword`. */
  accessToken: string;
  /**
   * `null` no fluxo de refresh — o Cognito **não** reemite refresh token ali, e
   * inventar um (repetindo o antigo) esconderia o dia em que ele passar a vir.
   */
  refreshToken: string | null;
  /** Validade do access token em segundos (tipicamente 3600). */
  expiresInSeconds: number;
}

/**
 * `AuthenticationResult` do Cognito → nossa `CognitoSession` (T-106).
 *
 * Mapper compartilhado por `cognitoInitiateAuth` (login por senha) e
 * `cognitoRefreshSession`, que respondem o mesmo envelope.
 *
 * **`ChallengeName` é erro, não sucesso.** Quando o pool pede MFA, troca
 * obrigatória de senha (`NEW_PASSWORD_REQUIRED`) ou device auth, a resposta vem
 * 200 **sem** `AuthenticationResult`. Tratar isso como "sem token" viraria um
 * erro genérico e a causa real (o pool exige um passo que não implementamos)
 * ficaria invisível — MFA está fora do escopo da T-106 e precisa aparecer como
 * tal.
 *
 * **Nenhum token entra em mensagem de erro.**
 */
export function toCognitoSession(payload: Record<string, unknown>): CognitoSession {
  const challenge = payload.ChallengeName;
  if (typeof challenge === 'string' && challenge.trim()) {
    throw new CognitoApiError(
      'challengeRequired',
      `Cognito pediu um desafio nao suportado (${challenge})`
    );
  }

  const result = payload.AuthenticationResult;
  if (typeof result !== 'object' || result === null) {
    throw new CognitoApiError('unexpectedResponse', 'Resposta do Cognito sem AuthenticationResult');
  }
  const authResult = result as Record<string, unknown>;

  const accessToken =
    typeof authResult.AccessToken === 'string' ? authResult.AccessToken.trim() : '';
  if (!accessToken) {
    throw new CognitoApiError('unexpectedResponse', 'Resposta do Cognito sem AccessToken');
  }

  const refreshToken =
    typeof authResult.RefreshToken === 'string' && authResult.RefreshToken.trim()
      ? authResult.RefreshToken.trim()
      : null;

  const expiresInSeconds =
    typeof authResult.ExpiresIn === 'number' && Number.isFinite(authResult.ExpiresIn)
      ? authResult.ExpiresIn
      : 0;

  return { accessToken, refreshToken, expiresInSeconds };
}
