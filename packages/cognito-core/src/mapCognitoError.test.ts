import { describe, it, expect } from 'vitest';
import { mapCognitoError } from './mapCognitoError';

describe('mapCognitoError (T-106)', () => {
  it('traduz os __type que a tela precisa distinguir', () => {
    expect(mapCognitoError('NotAuthorizedException')).toBe('invalidCredentials');
    expect(mapCognitoError('UserNotFoundException')).toBe('userNotFound');
    expect(mapCognitoError('UserNotConfirmedException')).toBe('userNotConfirmed');
    expect(mapCognitoError('UsernameExistsException')).toBe('emailAlreadyExists');
    expect(mapCognitoError('AliasExistsException')).toBe('emailAlreadyExists');
    expect(mapCognitoError('InvalidPasswordException')).toBe('weakPassword');
    expect(mapCognitoError('CodeMismatchException')).toBe('invalidCode');
    expect(mapCognitoError('ExpiredCodeException')).toBe('expiredCode');
    expect(mapCognitoError('CodeDeliveryFailureException')).toBe('codeDeliveryFailure');
    expect(mapCognitoError('InvalidParameterException')).toBe('invalidParameter');
  });

  it('junta as quatro caras de throttling num code só', () => {
    expect(mapCognitoError('TooManyRequestsException')).toBe('tooManyRequests');
    expect(mapCognitoError('TooManyFailedAttemptsException')).toBe('tooManyRequests');
    expect(mapCognitoError('LimitExceededException')).toBe('tooManyRequests');
    expect(mapCognitoError('ThrottlingException')).toBe('tooManyRequests');
  });

  it('descarta o prefixo qualificado do __type', () => {
    expect(mapCognitoError('com.amazonaws.cognitoidentityprovider#CodeMismatchException')).toBe(
      'invalidCode'
    );
  });

  it('tolera espaço em volta', () => {
    expect(mapCognitoError('  UserNotFoundException  ')).toBe('userNotFound');
  });

  it('__type desconhecido vira unexpected, nunca sucesso', () => {
    expect(mapCognitoError('SomeBrandNewException')).toBe('unexpected');
    expect(mapCognitoError('')).toBe('unexpected');
  });
});
