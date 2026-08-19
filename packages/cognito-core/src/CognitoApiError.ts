/**
 * Erro tipado do client do AWS Cognito (T-106).
 *
 * ## Por que um `code` fechado, e não a mensagem da AWS
 *
 * A rota precisa decidir status HTTP e texto para o usuário a partir de *uma*
 * informação estável. O `__type` da AWS (`NotAuthorizedException`,
 * `InvalidPasswordException`…) é estável o bastante, mas a `message` **não é**:
 * ela muda com a configuração do pool, vem em inglês e às vezes descreve
 * política interna ("Password did not conform with policy: Password must have
 * uppercase characters"). Deixá-la vazar para o cliente vira dois problemas de
 * uma vez — texto de produto que ninguém revisou e detalhe de infraestrutura
 * nossa exposto.
 *
 * Então: **nada da AWS entra na resposta HTTP**. Este erro carrega um `code` do
 * nosso vocabulário e uma `message` escrita à mão para log; quem traduz para
 * HTTP + texto em português é `packages/rest-api/src/api/auth/cognitoErrorResponse.ts`.
 *
 * ## O que NUNCA entra na mensagem
 *
 * Senha, código de confirmação, `SECRET_HASH`, `COGNITO_CLIENT_SECRET` e
 * qualquer token (access/id/refresh). Nem em erro de rede: o `Error` do `fetch`
 * pode carregar a request inteira no `cause`, então o erro de rede é escrito à
 * mão e o original é descartado (mesma doutrina do `pluggy-core`).
 */
export type CognitoErrorCode =
  /** Falta `COGNITO_REGION`/`COGNITO_USER_POOL_ID`/`COGNITO_CLIENT_ID` — fail closed. */
  | 'configMissing'
  /** Rede, DNS ou timeout: não sabemos se a operação aconteceu. */
  | 'network'
  /** Usuário ou senha inválidos (`NotAuthorizedException`). */
  | 'invalidCredentials'
  /** Usuário não existe no pool (`UserNotFoundException`). */
  | 'userNotFound'
  /** Cadastro existe mas o e-mail não foi confirmado (`UserNotConfirmedException`). */
  | 'userNotConfirmed'
  /** E-mail já cadastrado (`UsernameExistsException`). */
  | 'emailAlreadyExists'
  /** Senha não atende à política do pool (`InvalidPasswordException`). */
  | 'weakPassword'
  /** Código de confirmação errado (`CodeMismatchException`). */
  | 'invalidCode'
  /** Código de confirmação vencido (`ExpiredCodeException`). */
  | 'expiredCode'
  /** O Cognito não conseguiu enviar o e-mail/SMS (`CodeDeliveryFailureException`). */
  | 'codeDeliveryFailure'
  /** Throttling do Cognito (`TooManyRequestsException`, `LimitExceededException`…). */
  | 'tooManyRequests'
  /** Request malformada segundo o Cognito (`InvalidParameterException`). */
  | 'invalidParameter'
  /** O pool pediu um desafio (MFA, NEW_PASSWORD_REQUIRED) — fora de escopo hoje. */
  | 'challengeRequired'
  /** Resposta 2xx com corpo que não bate com o contrato esperado. */
  | 'unexpectedResponse'
  /** Qualquer outro erro do Cognito. */
  | 'unexpected';

export class CognitoApiError extends Error {
  readonly code: CognitoErrorCode;

  /** Status HTTP quando o erro veio de uma resposta; `undefined` em rede/timeout/config. */
  readonly status?: number;

  constructor(code: CognitoErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'CognitoApiError';
    this.code = code;
    this.status = status;
  }
}
