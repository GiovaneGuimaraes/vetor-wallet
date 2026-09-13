import { cognitoIdpCall } from './cognitoIdpCall';
import { resolveCognitoConfig } from './resolveCognitoConfig';
import { secretHashFields } from './secretHashFields';

/**
 * `ForgotPassword` — inicia a recuperação de senha (T-108a).
 *
 * Irmã de `cognitoResendConfirmationCode`: mesmo formato de corpo (`ClientId`,
 * `Username`, `SecretHash` opcional na raiz), mesma ausência de retorno útil —
 * a resposta traz `CodeDeliveryDetails` com o destino mascarado, que não
 * devolvemos por não termos ganho nenhum em ecoar (o usuário acabou de digitar
 * o próprio e-mail).
 *
 * ## Quem decide "204 sempre" não é esta função
 *
 * Esta função **propaga** o erro do Cognito como `CognitoApiError`, igual a
 * toda outra função deste package — inclusive `userNotFound`. É a rota
 * (`POST /api/auth/forgot-password`) quem mascara esse `userNotFound` (e
 * qualquer outro desfecho previsível) atrás de um 204 uniforme, para o
 * formulário não virar enumerador de contas. Esta função não sabe disso e não
 * deveria saber: ela só fala com o Cognito.
 */
export async function cognitoForgotPassword(email: string): Promise<void> {
  const config = resolveCognitoConfig();
  const username = email.toLowerCase().trim();

  await cognitoIdpCall('ForgotPassword', {
    ClientId: config.clientId,
    Username: username,
    ...secretHashFields({ config, username, key: 'SecretHash' }),
  });
}
