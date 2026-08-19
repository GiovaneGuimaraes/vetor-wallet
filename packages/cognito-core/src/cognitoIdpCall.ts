import { COGNITO_TIMEOUT_MS } from './COGNITO_TIMEOUT_MS';
import { CognitoApiError } from './CognitoApiError';
import { mapCognitoError } from './mapCognitoError';
import { resolveCognitoConfig } from './resolveCognitoConfig';

/**
 * Uma chamada à API do Cognito Identity Provider (T-106).
 *
 * ## Por que `fetch` e não o SDK da AWS
 *
 * As operações que este package usa — `SignUp`, `InitiateAuth`
 * (`USER_PASSWORD_AUTH` e `REFRESH_TOKEN_AUTH`), `ConfirmSignUp`,
 * `ResendConfirmationCode`, `GetUser`, `ChangePassword` — são **não
 * autenticadas por IAM**: a credencial é o próprio `ClientId` (+ `SECRET_HASH`)
 * ou o access token do usuário. Sem IAM não há **SigV4**, e sem SigV4 o SDK não
 * paga o próprio peso: o protocolo é um POST JSON com dois headers.
 *
 * O que o SDK traria de fato é assinatura SigV4 para as operações `Admin*`
 * (`AdminConfirmSignUp`, `AdminSetUserPassword`), e é justamente o que a T-106
 * decidiu **não** implementar — elas exigem credencial IAM que o app ainda não
 * tem. Se um dia entrarem, `@aws-sdk/client-cognito-identity-provider` vira
 * dependência **deste** package (não da raiz) e este arquivo continua servindo
 * o caminho sem IAM.
 *
 * ## Protocolo (AWS JSON 1.1)
 *
 * `POST https://cognito-idp.<region>.amazonaws.com/`, header
 * `X-Amz-Target: AWSCognitoIdentityProviderService.<Action>` e
 * `Content-Type: application/x-amz-json-1.1`. Erro vem com status 4xx e corpo
 * `{ "__type": "...Exception", "message": "..." }`.
 *
 * ## Nada degrada em silêncio, nada da AWS vaza
 *
 * Rede, timeout, status não-ok e corpo ilegível viram `CognitoApiError` com
 * `code` do nosso vocabulário. A `message` da AWS **não** entra no erro (ver
 * `CognitoApiError`), e o corpo enviado — que carrega senha, código de
 * confirmação e `SECRET_HASH` — não entra em lugar nenhum: nem no erro de rede,
 * onde o `cause` do `fetch` poderia trazê-lo de carona.
 */
export async function cognitoIdpCall(
  action: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { region } = resolveCognitoConfig();

  let res: Response;
  try {
    res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(COGNITO_TIMEOUT_MS),
    });
  } catch {
    // Sem o erro original de propósito: o `cause` do fetch pode carregar a
    // request inteira (com senha e SECRET_HASH).
    throw new CognitoApiError('network', `Falha de rede ao chamar o Cognito (${action})`);
  }

  const raw = await res.text().catch(() => '');
  let payload: unknown = undefined;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = undefined;
    }
  }

  if (!res.ok) {
    const rawType =
      typeof payload === 'object' && payload !== null
        ? ((payload as { __type?: unknown }).__type ?? '')
        : '';
    // Status 429 sem `__type` legível ainda é throttling — é a única leitura
    // possível e tratá-la como 'unexpected' faria a rota devolver 502 para uma
    // situação de "tente de novo em instantes".
    const code =
      typeof rawType === 'string' && rawType.trim()
        ? mapCognitoError(rawType)
        : res.status === 429
          ? 'tooManyRequests'
          : 'unexpected';
    throw new CognitoApiError(code, `Cognito recusou ${action} (HTTP ${res.status})`, res.status);
  }

  // `ChangePassword` e `ConfirmSignUp` respondem `{}`; um corpo vazio (sem
  // JSON) também conta como "ok, nada a dizer".
  if (payload === undefined) return {};

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new CognitoApiError(
      'unexpectedResponse',
      `Resposta do Cognito em ${action} nao e um objeto JSON`,
      res.status
    );
  }

  return payload as Record<string, unknown>;
}
