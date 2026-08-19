import { describe, it, expect } from 'vitest';
import { CognitoApiError, type CognitoErrorCode } from '@vetor-wallet/cognito-core';
import { cognitoErrorResponse, isCognitoApiError } from './cognitoErrorResponse';

const ALL_CODES: CognitoErrorCode[] = [
  'configMissing',
  'network',
  'invalidCredentials',
  'userNotFound',
  'userNotConfirmed',
  'emailAlreadyExists',
  'weakPassword',
  'invalidCode',
  'expiredCode',
  'codeDeliveryFailure',
  'tooManyRequests',
  'invalidParameter',
  'challengeRequired',
  'unexpectedResponse',
  'unexpected',
];

describe('cognitoErrorResponse (T-106)', () => {
  it('cobre TODO code do vocabulário com status e mensagem em português', () => {
    for (const code of ALL_CODES) {
      const response = cognitoErrorResponse(code);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.error.length).toBeGreaterThan(0);
    }
  });

  it('usuário inexistente responde exatamente como senha errada (sem oráculo de e-mail)', () => {
    expect(cognitoErrorResponse('userNotFound')).toEqual(
      cognitoErrorResponse('invalidCredentials')
    );
    expect(cognitoErrorResponse('invalidCredentials').status).toBe(401);
  });

  it('mapeia o que a tela precisa distinguir', () => {
    expect(cognitoErrorResponse('configMissing')).toMatchObject({
      status: 503,
      code: 'AUTH_UNAVAILABLE',
    });
    expect(cognitoErrorResponse('network')).toMatchObject({ status: 502 });
    expect(cognitoErrorResponse('userNotConfirmed')).toMatchObject({
      status: 403,
      code: 'USER_NOT_CONFIRMED',
    });
    expect(cognitoErrorResponse('emailAlreadyExists').status).toBe(409);
    expect(cognitoErrorResponse('weakPassword').status).toBe(400);
    expect(cognitoErrorResponse('invalidCode')).toMatchObject({
      status: 400,
      code: 'INVALID_CODE',
    });
    expect(cognitoErrorResponse('expiredCode')).toMatchObject({
      status: 400,
      code: 'EXPIRED_CODE',
    });
    expect(cognitoErrorResponse('codeDeliveryFailure').status).toBe(502);
    expect(cognitoErrorResponse('tooManyRequests').status).toBe(429);
  });

  it('problema de configuração do pool é 5xx, não 4xx (não é culpa de quem digitou)', () => {
    expect(cognitoErrorResponse('invalidParameter').status).toBe(502);
    expect(cognitoErrorResponse('challengeRequired').status).toBe(501);
    expect(cognitoErrorResponse('unexpected').status).toBe(502);
    expect(cognitoErrorResponse('unexpectedResponse').status).toBe(502);
  });

  it('nenhuma mensagem carrega jargão da AWS nem termo de token', () => {
    // O nome do provedor aparece de propósito em UM caso: o 503 de
    // `configMissing` é lido por quem opera o servidor, e "Cognito nao
    // configurado" é a única forma de a mensagem ser acionável. Fora dele,
    // nome de exceção da AWS, "token" e "sub" não vazam para o cliente.
    for (const code of ALL_CODES) {
      const { error } = cognitoErrorResponse(code);
      expect(error).not.toMatch(/Exception|AWS|token|sub\b/i);
      if (code !== 'configMissing') expect(error).not.toMatch(/cognito/i);
    }
  });

  it('isCognitoApiError só aceita o erro do package', () => {
    expect(isCognitoApiError(new CognitoApiError('network', 'x'))).toBe(true);
    expect(isCognitoApiError(new Error('x'))).toBe(false);
    expect(isCognitoApiError(null)).toBe(false);
  });
});
