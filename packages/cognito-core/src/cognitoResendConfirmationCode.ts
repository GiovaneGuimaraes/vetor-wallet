import { cognitoIdpCall } from './cognitoIdpCall';
import { resolveCognitoConfig } from './resolveCognitoConfig';
import { secretHashFields } from './secretHashFields';

/**
 * `ResendConfirmationCode` — manda outro código de confirmação (T-106).
 *
 * Par obrigatório do `cognitoConfirmSignUp`: o código do Cognito vence (24h por
 * padrão) e e-mail se perde. Sem reenvio, um cadastro cujo código expirou fica
 * num limbo do qual só um admin sairia — e não temos credencial IAM para
 * operações `Admin*` (ver `CLAUDE.md` deste package).
 *
 * A resposta traz `CodeDeliveryDetails` com o destino **mascarado** pelo
 * Cognito. Não devolvemos nada: o usuário acabou de digitar o próprio e-mail na
 * tela, e ecoar destino de entrega é superfície de enumeração sem ganho.
 */
export async function cognitoResendConfirmationCode(email: string): Promise<void> {
  const config = resolveCognitoConfig();
  const username = email.toLowerCase().trim();

  await cognitoIdpCall('ResendConfirmationCode', {
    ClientId: config.clientId,
    Username: username,
    ...secretHashFields({ config, username, key: 'SecretHash' }),
  });
}
