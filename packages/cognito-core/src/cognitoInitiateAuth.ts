import { cognitoIdpCall } from './cognitoIdpCall';
import { resolveCognitoConfig } from './resolveCognitoConfig';
import { secretHashFields } from './secretHashFields';
import { toCognitoSession, type CognitoSession } from './toCognitoSession';

/**
 * `InitiateAuth` com `USER_PASSWORD_AUTH` — o login (T-106).
 *
 * ## Por que este fluxo, e não Hosted UI / OAuth
 *
 * Decisão do humano (2026-08-18): **a tela de login continua nossa**. O
 * `rest-api` recebe e-mail e senha, troca com o Cognito por tokens e mantém o
 * cookie de sessão `sid` do `express-session` que já existe. Consequências que
 * não são negociáveis por conveniência:
 *
 * - o **`USER_PASSWORD_AUTH` precisa estar habilitado no app client** do pool
 *   (`ALLOW_USER_PASSWORD_AUTH`); sem isso o Cognito responde
 *   `InvalidParameterException` e a rota devolve 502 — é o primeiro lugar a
 *   olhar se o login não funciona contra o pool real;
 * - a senha trafega até o **nosso** servidor. É o preço de não usar Hosted UI, e
 *   é por isso que ela não pode aparecer em log nenhum (ver `cognitoIdpCall`);
 * - os tokens ficam **na sessão do servidor** (SQLite), nunca no browser: o
 *   front continua sem saber que existe Cognito.
 *
 * Não escreve nada no nosso banco — quem espelha o `sub` em `users` é o
 * `auth-core`, chamado pela rota.
 */
export async function cognitoInitiateAuth(params: {
  email: string;
  password: string;
}): Promise<CognitoSession> {
  const config = resolveCognitoConfig();
  const username = params.email.toLowerCase().trim();

  const payload = await cognitoIdpCall('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: config.clientId,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: params.password,
      ...secretHashFields({ config, username, key: 'SECRET_HASH' }),
    },
  });

  return toCognitoSession(payload);
}
