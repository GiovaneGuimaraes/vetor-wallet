import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isCognitoConfigured } from './isCognitoConfigured';

function clearEnv(): void {
  delete process.env.COGNITO_REGION;
  delete process.env.COGNITO_USER_POOL_ID;
  delete process.env.COGNITO_CLIENT_ID;
}

beforeEach(clearEnv);
afterEach(clearEnv);

describe('isCognitoConfigured (T-106)', () => {
  it('true com as três variáveis presentes', () => {
    process.env.COGNITO_REGION = 'us-east-1';
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_TESTPOOL';
    process.env.COGNITO_CLIENT_ID = 'client-abc';
    expect(isCognitoConfigured()).toBe(true);
  });

  it('false sem configuração — devolve booleano em vez de lançar', () => {
    expect(isCognitoConfigured()).toBe(false);
  });
});
