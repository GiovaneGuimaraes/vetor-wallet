import type { CognitoErrorCode } from './CognitoApiError';

/**
 * `__type` da AWS → `CognitoErrorCode` nosso (T-106).
 *
 * O corpo de erro do Cognito é `{ "__type": "NotAuthorizedException",
 * "message": "Incorrect username or password." }`, e o `__type` pode vir
 * qualificado (`com.amazonaws.cognitoidentityprovider#NotAuthorizedException`)
 * dependendo do protocolo — por isso o prefixo até o `#` é descartado.
 *
 * Tudo o que não está na tabela vira `'unexpected'`: um `__type` novo da AWS
 * **não** pode virar sucesso nem 500 com texto da AWS na resposta.
 */
const BY_TYPE: Record<string, CognitoErrorCode> = {
  NotAuthorizedException: 'invalidCredentials',
  UserNotFoundException: 'userNotFound',
  UserNotConfirmedException: 'userNotConfirmed',
  UsernameExistsException: 'emailAlreadyExists',
  AliasExistsException: 'emailAlreadyExists',
  InvalidPasswordException: 'weakPassword',
  CodeMismatchException: 'invalidCode',
  ExpiredCodeException: 'expiredCode',
  CodeDeliveryFailureException: 'codeDeliveryFailure',
  TooManyRequestsException: 'tooManyRequests',
  TooManyFailedAttemptsException: 'tooManyRequests',
  LimitExceededException: 'tooManyRequests',
  ThrottlingException: 'tooManyRequests',
  InvalidParameterException: 'invalidParameter',
};

export function mapCognitoError(rawType: string): CognitoErrorCode {
  const type = rawType.includes('#') ? rawType.slice(rawType.lastIndexOf('#') + 1) : rawType;
  return BY_TYPE[type.trim()] ?? 'unexpected';
}
