import { computeSecretHash } from './computeSecretHash';
import type { CognitoConfig } from './resolveCognitoConfig';

/**
 * Os campos de secret hash de uma request, ou nada (T-106).
 *
 * Um só lugar decide "o pool tem client secret?" para todas as operações. A
 * alternativa — um ternário repetido em cada função — é o formato de bug que
 * some no diff: basta *uma* chamada esquecer o hash para o Cognito responder
 * `NotAuthorizedException`, que a rota traduz como "senha inválida". O usuário
 * veria "senha errada" num fluxo em que a senha está certa.
 *
 * Devolve `{}` quando não há secret: em app client sem secret, **enviar** o
 * hash é erro do lado da AWS, não campo ignorado.
 *
 * ## O nome do campo muda com a operação — de propósito
 *
 * `SignUp`, `ConfirmSignUp` e `ResendConfirmationCode` recebem **`SecretHash`**
 * na raiz do corpo; `InitiateAuth` recebe **`SECRET_HASH`** dentro de
 * `AuthParameters` (é um mapa de string, com a convenção em CAIXA ALTA do
 * fluxo de auth). Não é sinônimo: o Cognito **ignora** a chave errada e depois
 * recusa a chamada por falta do hash. Daí o `key` explícito no argumento, em
 * vez de um default que funcionaria em três chamadas e falharia na quarta.
 */
export function secretHashFields(params: {
  config: CognitoConfig;
  username: string;
  key: 'SecretHash' | 'SECRET_HASH';
}): Record<string, string> {
  const { config, username, key } = params;
  if (!config.clientSecret) return {};
  return {
    [key]: computeSecretHash({
      username,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    }),
  };
}
