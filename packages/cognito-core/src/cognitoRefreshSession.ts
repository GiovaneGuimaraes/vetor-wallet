import { cognitoIdpCall } from './cognitoIdpCall';
import { resolveCognitoConfig } from './resolveCognitoConfig';
import { secretHashFields } from './secretHashFields';
import { toCognitoSession, type CognitoSession } from './toCognitoSession';

/**
 * `InitiateAuth` com `REFRESH_TOKEN_AUTH` — access token novo sem pedir a senha
 * de novo (T-106).
 *
 * ## Por que isto existe (não é otimização)
 *
 * O access token do Cognito vive **1 hora** por padrão; o nosso cookie de
 * sessão vive **7 dias** (`packages/rest-api/src/api/index.ts`). Como a troca de
 * senha usa `ChangePassword`, que exige access token válido, sem refresh a
 * funcionalidade estaria quebrada para qualquer usuário logado há mais de uma
 * hora — ou seja, na prática sempre. A alternativa seria exigir login antes de
 * trocar a senha, o que contraria a invariante da T-094 (a troca acontece
 * dentro da sessão e não a invalida).
 *
 * O refresh token fica na **sessão do servidor** (SQLite), nunca no browser.
 *
 * ## `username` no argumento
 *
 * Quando o app client tem secret, o `SECRET_HASH` do fluxo de refresh também é
 * calculado sobre um username — e não há username no corpo da request para
 * inferi-lo. Por isso ele vem de fora (a rota guarda na sessão o mesmo string
 * usado no login). **Não conferido contra pool com secret** (ver "o que não foi
 * provado" no `CLAUDE.md` deste package): se um pool com secret recusar o
 * refresh, este é o primeiro suspeito — a AWS documenta o hash sobre o
 * *username* do usuário, que em alguns pools é o `sub` e não o e-mail.
 */
export async function cognitoRefreshSession(params: {
  refreshToken: string;
  username: string;
}): Promise<CognitoSession> {
  const config = resolveCognitoConfig();
  const username = params.username.toLowerCase().trim();

  const payload = await cognitoIdpCall('InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: config.clientId,
    AuthParameters: {
      REFRESH_TOKEN: params.refreshToken,
      ...secretHashFields({ config, username, key: 'SECRET_HASH' }),
    },
  });

  return toCognitoSession(payload);
}
