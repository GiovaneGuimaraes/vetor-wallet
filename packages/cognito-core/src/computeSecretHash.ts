import { createHmac } from 'crypto';

/**
 * `SECRET_HASH` do Cognito (T-106).
 *
 * Definição da AWS: **base64(HMAC-SHA256(username + clientId, clientSecret))** —
 * a chave do HMAC é o *client secret* e a mensagem é a concatenação
 * `username + clientId`, nessa ordem, sem separador. Inverter os dois (chave e
 * mensagem trocadas, ou `clientId + username`) produz um hash perfeitamente
 * válido que o Cognito recusa com `NotAuthorizedException` — indistinguível de
 * "senha errada" na tela. Daí o teste com vetor fixo neste package.
 *
 * O `username` tem de ser **o mesmo string enviado no campo `Username`** da
 * request. Se o login manda o e-mail, o hash é sobre o e-mail; se manda o
 * `sub`, é sobre o `sub`.
 *
 * Só é chamada quando o app client tem secret (`clientSecret != null`) — em
 * client sem secret, mandar `SECRET_HASH` é erro do lado da AWS.
 */
export function computeSecretHash(params: {
  username: string;
  clientId: string;
  clientSecret: string;
}): string {
  return createHmac('sha256', params.clientSecret)
    .update(`${params.username}${params.clientId}`)
    .digest('base64');
}
