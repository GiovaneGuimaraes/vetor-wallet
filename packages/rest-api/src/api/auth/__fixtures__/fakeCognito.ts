/**
 * User pool do Cognito de mentira, para os testes de rota (T-106).
 *
 * ## Por que mockar `fetch`, e não o package
 *
 * `vi.mock('@vetor-wallet/cognito-core')` provaria que a rota chama a função
 * certa e nada além disso — o `SECRET_HASH`, o `X-Amz-Target`, a tradução do
 * `__type` e a leitura do `AuthenticationResult` ficariam fora do teste, que é
 * justamente onde a integração quebra. Mockando o `fetch` a suíte exercita o
 * `cognito-core` de verdade e só o servidor da AWS é falso. **Nenhum teste bate
 * na AWS.**
 *
 * ## Por que um fixture compartilhado
 *
 * Vinte arquivos de teste de rota criam usuário por `POST /api/auth/register`
 * porque é assim que se consegue uma sessão. Depois da T-106 esse POST fala com
 * o Cognito, então todos precisam de um pool falso — e a alternativa (repetir o
 * stub em cada arquivo) garantiria versões divergentes do mesmo mock.
 *
 * O comportamento default é **`UserConfirmed: true`** (pool sem verificação de
 * e-mail), que é o que mantém aqueles vinte arquivos funcionando sem mudar o
 * fluxo deles. Qual modo o pool real vai usar é decisão de produto aberta na
 * T-106; quem testa o outro caminho pede `autoConfirm: false`.
 *
 * `email_verified` é modelado **separado** de `UserConfirmed` (opção
 * `emailVerified`) porque a combinação "cadastro auto-confirmado + e-mail não
 * verificado" é o cenário de account takeover do vínculo por e-mail. Um fixture
 * que amarrasse os dois campos deixaria o ataque impossível de escrever em teste
 * — e foi assim que ele passou na primeira implementação da T-106.
 */

import { computeSecretHash } from '@vetor-wallet/cognito-core';

interface FakeUser {
  sub: string;
  password: string;
  confirmed: boolean;
  /**
   * `email_verified` do pool — **independente de `confirmed`**, de propósito.
   *
   * Um pool que auto-confirma cadastros (login liberado direto) pode perfeitamente
   * nunca verificar o e-mail, e é exatamente essa combinação que abria o caminho
   * de account takeover no vínculo por e-mail. Amarrar os dois aqui esconderia o
   * cenário do teste.
   */
  emailVerified: boolean;
  /** Código de confirmação "enviado por e-mail". */
  code: string;
}

export interface FakeCognitoPool {
  users: Map<string, FakeUser>;
  /** Requests recebidas, na ordem: `[action, body]`. */
  calls: [string, Record<string, any>][];
  /** Invalida todos os access tokens emitidos (simula o vencimento de 1h). */
  expireAccessTokens(): void;
  /** Invalida os refresh tokens emitidos (simula revogação). */
  expireRefreshTokens(): void;
  /** Volta o `fetch` original e limpa o estado. */
  restore(): void;
}

export interface FakeCognitoOptions {
  /** `false` = o pool exige confirmação por código (o `SignUp` volta não confirmado). */
  autoConfirm?: boolean;
  /**
   * `email_verified` com que o usuário nasce. Default = `autoConfirm` (pool que
   * auto-confirma normalmente marca o e-mail como verificado), mas os dois são
   * ajustáveis separadamente porque a combinação
   * `autoConfirm: true` + `emailVerified: false` é o cenário de takeover.
   * `ConfirmSignUp` com o código correto sempre marca verificado — confirmar por
   * código É a prova de posse da caixa.
   */
  emailVerified?: boolean;
  /** Presente = app client COM secret; o pool falso exige o `SECRET_HASH` correto. */
  clientSecret?: string;
  region?: string;
  userPoolId?: string;
  clientId?: string;
}

const ENDPOINT_RE = /^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\/$/;

function awsError(type: string, status = 400): Response {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ __type: type, message: `${type} (pool de teste)` }),
  } as unknown as Response;
}

function awsOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

export function installFakeCognito(options: FakeCognitoOptions = {}): FakeCognitoPool {
  const autoConfirm = options.autoConfirm ?? true;
  const emailVerifiedAtSignUp = options.emailVerified ?? autoConfirm;
  const region = options.region ?? 'us-east-1';
  const userPoolId = options.userPoolId ?? 'us-east-1_FAKEPOOL';
  const clientId = options.clientId ?? 'fake-client-id';

  process.env.COGNITO_REGION = region;
  process.env.COGNITO_USER_POOL_ID = userPoolId;
  process.env.COGNITO_CLIENT_ID = clientId;
  if (options.clientSecret) process.env.COGNITO_CLIENT_SECRET = options.clientSecret;
  else delete process.env.COGNITO_CLIENT_SECRET;

  const users = new Map<string, FakeUser>();
  const calls: [string, Record<string, any>][] = [];
  const accessTokens = new Map<string, string>();
  const refreshTokens = new Map<string, string>();
  let seq = 0;

  const originalFetch = globalThis.fetch;

  function expectedSecretHash(username: string): string | null {
    if (!options.clientSecret) return null;
    return computeSecretHash({ username, clientId, clientSecret: options.clientSecret });
  }

  function checkSecretHash(username: string, got: unknown): Response | null {
    const expected = expectedSecretHash(username);
    if (expected === null) {
      // Pool sem secret: mandar hash é erro do lado da AWS.
      return got === undefined ? null : awsError('InvalidParameterException');
    }
    return got === expected ? null : awsError('NotAuthorizedException');
  }

  function issue(username: string): Record<string, unknown> {
    seq += 1;
    const accessToken = `access-${seq}-${username}`;
    const refreshToken = `refresh-${seq}-${username}`;
    accessTokens.set(accessToken, username);
    refreshTokens.set(refreshToken, username);
    return {
      AuthenticationResult: {
        AccessToken: accessToken,
        IdToken: `id-${seq}`,
        RefreshToken: refreshToken,
        ExpiresIn: 3600,
        TokenType: 'Bearer',
      },
    };
  }

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (!ENDPOINT_RE.test(String(url))) {
      throw new Error(`fakeCognito: fetch inesperado para ${url}`);
    }

    const target = String((init.headers as Record<string, string>)['X-Amz-Target'] ?? '');
    const action = target.replace('AWSCognitoIdentityProviderService.', '');
    const body = JSON.parse(String(init.body)) as Record<string, any>;
    calls.push([action, body]);

    if (action === 'SignUp') {
      const username = String(body.Username);
      const bad = checkSecretHash(username, body.SecretHash);
      if (bad) return bad;
      if (users.has(username)) return awsError('UsernameExistsException');
      if (String(body.Password).length < 8) return awsError('InvalidPasswordException');
      const sub = `sub-${username}`;
      users.set(username, {
        sub,
        password: String(body.Password),
        confirmed: autoConfirm,
        emailVerified: emailVerifiedAtSignUp,
        code: '123456',
      });
      return awsOk({ UserSub: sub, UserConfirmed: autoConfirm });
    }

    if (action === 'ConfirmSignUp') {
      const username = String(body.Username);
      const bad = checkSecretHash(username, body.SecretHash);
      if (bad) return bad;
      const user = users.get(username);
      if (!user) return awsError('UserNotFoundException');
      if (user.confirmed) return awsError('NotAuthorizedException');
      if (String(body.ConfirmationCode) !== user.code) return awsError('CodeMismatchException');
      user.confirmed = true;
      // Confirmar pelo codigo do e-mail E a prova de posse da caixa.
      user.emailVerified = true;
      return awsOk({});
    }

    if (action === 'ResendConfirmationCode') {
      const username = String(body.Username);
      const bad = checkSecretHash(username, body.SecretHash);
      if (bad) return bad;
      const user = users.get(username);
      if (!user) return awsError('UserNotFoundException');
      return awsOk({ CodeDeliveryDetails: { Destination: 'a***@e***.com' } });
    }

    if (action === 'InitiateAuth' && body.AuthFlow === 'USER_PASSWORD_AUTH') {
      const username = String(body.AuthParameters.USERNAME);
      const bad = checkSecretHash(username, body.AuthParameters.SECRET_HASH);
      if (bad) return bad;
      const user = users.get(username);
      if (!user) return awsError('UserNotFoundException');
      if (user.password !== String(body.AuthParameters.PASSWORD)) {
        return awsError('NotAuthorizedException');
      }
      if (!user.confirmed) return awsError('UserNotConfirmedException');
      return awsOk(issue(username));
    }

    if (action === 'InitiateAuth' && body.AuthFlow === 'REFRESH_TOKEN_AUTH') {
      const token = String(body.AuthParameters.REFRESH_TOKEN);
      const username = refreshTokens.get(token);
      if (!username) return awsError('NotAuthorizedException');
      const bad = checkSecretHash(username, body.AuthParameters.SECRET_HASH);
      if (bad) return bad;
      const issued = issue(username) as { AuthenticationResult: Record<string, unknown> };
      // O Cognito NÃO reemite refresh token neste fluxo.
      delete issued.AuthenticationResult.RefreshToken;
      return awsOk(issued);
    }

    if (action === 'GetUser') {
      const username = accessTokens.get(String(body.AccessToken));
      if (!username) return awsError('NotAuthorizedException');
      const user = users.get(username);
      if (!user) return awsError('UserNotFoundException');
      return awsOk({
        Username: username,
        UserAttributes: [
          { Name: 'sub', Value: user.sub },
          { Name: 'email', Value: username },
          { Name: 'email_verified', Value: String(user.emailVerified) },
        ],
      });
    }

    if (action === 'ChangePassword') {
      const username = accessTokens.get(String(body.AccessToken));
      if (!username) return awsError('NotAuthorizedException');
      const user = users.get(username)!;
      if (user.password !== String(body.PreviousPassword)) {
        return awsError('NotAuthorizedException');
      }
      if (String(body.ProposedPassword).length < 8) return awsError('InvalidPasswordException');
      user.password = String(body.ProposedPassword);
      return awsOk({});
    }

    return awsError('InvalidParameterException');
  }) as unknown as typeof globalThis.fetch;

  return {
    users,
    calls,
    expireAccessTokens: () => accessTokens.clear(),
    expireRefreshTokens: () => refreshTokens.clear(),
    restore: () => {
      globalThis.fetch = originalFetch;
      delete process.env.COGNITO_REGION;
      delete process.env.COGNITO_USER_POOL_ID;
      delete process.env.COGNITO_CLIENT_ID;
      delete process.env.COGNITO_CLIENT_SECRET;
    },
  };
}
