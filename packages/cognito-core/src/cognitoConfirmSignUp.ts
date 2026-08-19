import { cognitoIdpCall } from './cognitoIdpCall';
import { resolveCognitoConfig } from './resolveCognitoConfig';
import { secretHashFields } from './secretHashFields';

/**
 * `ConfirmSignUp` — confirma o cadastro com o código enviado por e-mail (T-106).
 *
 * Serve o pool que **mantém** a verificação de e-mail (opção 1 da decisão de
 * produto ainda aberta na T-106). Se o humano acabar desligando a verificação no
 * pool, esta função simplesmente deixa de ser chamada: nada mais no código
 * depende dela.
 *
 * O código **nunca** entra em log ou mensagem de erro (ver `cognitoIdpCall`);
 * código errado vira `invalidCode` e vencido vira `expiredCode`, porque são
 * situações diferentes para quem está na tela — uma pede corrigir o dígito, a
 * outra pede um código novo (`cognitoResendConfirmationCode`).
 *
 * Idempotência: confirmar duas vezes **não** é sucesso silencioso no Cognito —
 * a segunda chamada responde `NotAuthorizedException` ("Current status is
 * CONFIRMED"), que aqui chega como `invalidCredentials`. Quem chama decide o que
 * dizer; não inventamos "já estava confirmado" a partir de um código de erro
 * ambíguo (o mesmo `__type` também significa código inválido em outros pools).
 */
export async function cognitoConfirmSignUp(params: { email: string; code: string }): Promise<void> {
  const config = resolveCognitoConfig();
  const username = params.email.toLowerCase().trim();

  await cognitoIdpCall('ConfirmSignUp', {
    ClientId: config.clientId,
    Username: username,
    ConfirmationCode: params.code.trim(),
    ...secretHashFields({ config, username, key: 'SecretHash' }),
  });
}
