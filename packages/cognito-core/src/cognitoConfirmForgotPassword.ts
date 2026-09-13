import { cognitoIdpCall } from './cognitoIdpCall';
import { resolveCognitoConfig } from './resolveCognitoConfig';
import { secretHashFields } from './secretHashFields';

/**
 * `ConfirmForgotPassword` — fecha a recuperação de senha com o código do
 * e-mail e a senha nova (T-108a).
 *
 * Irmã de `cognitoConfirmSignUp`: mesmo formato (`ClientId`, `Username`,
 * `ConfirmationCode`, `SecretHash` opcional na raiz), com o campo a mais que o
 * Cognito espera aqui — `Password` — nunca aparece em log ou mensagem de erro
 * (mesma doutrina do código de confirmação em `cognitoIdpCall`/`CognitoApiError`).
 *
 * `CodeMismatchException` → `invalidCode`, `ExpiredCodeException` →
 * `expiredCode`, `InvalidPasswordException` → `weakPassword`: os três chegam
 * como `CognitoApiError` comuns, sem tratamento especial aqui. A regra de
 * "204 sempre, inclusive para e-mail inexistente" é da rota
 * (`POST /api/auth/reset-password`), não desta função — ela só fala com o
 * Cognito e propaga o que ele responder.
 */
export async function cognitoConfirmForgotPassword(params: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  const config = resolveCognitoConfig();
  const username = params.email.toLowerCase().trim();

  await cognitoIdpCall('ConfirmForgotPassword', {
    ClientId: config.clientId,
    Username: username,
    ConfirmationCode: params.code.trim(),
    Password: params.newPassword,
    ...secretHashFields({ config, username, key: 'SecretHash' }),
  });
}
