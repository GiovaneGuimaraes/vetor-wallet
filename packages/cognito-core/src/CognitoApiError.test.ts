import { describe, it, expect } from 'vitest';
import { CognitoApiError } from './CognitoApiError';

describe('CognitoApiError (T-106)', () => {
  it('carrega code, message e status', () => {
    const err = new CognitoApiError('invalidCredentials', 'Cognito recusou InitiateAuth', 400);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CognitoApiError');
    expect(err.code).toBe('invalidCredentials');
    expect(err.message).toBe('Cognito recusou InitiateAuth');
    expect(err.status).toBe(400);
  });

  it('status é opcional (rede/timeout/config não têm HTTP)', () => {
    const err = new CognitoApiError('network', 'Falha de rede ao chamar o Cognito (SignUp)');
    expect(err.status).toBeUndefined();
  });
});
