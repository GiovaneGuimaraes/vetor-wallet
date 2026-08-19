import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveCognitoConfig } from './resolveCognitoConfig';
import { CognitoApiError } from './CognitoApiError';

const KEYS = [
  'COGNITO_REGION',
  'COGNITO_USER_POOL_ID',
  'COGNITO_CLIENT_ID',
  'COGNITO_CLIENT_SECRET',
] as const;

function clearEnv(): void {
  for (const key of KEYS) delete process.env[key];
}

beforeEach(() => {
  clearEnv();
  process.env.COGNITO_REGION = 'us-east-1';
  process.env.COGNITO_USER_POOL_ID = 'us-east-1_TESTPOOL';
  process.env.COGNITO_CLIENT_ID = 'client-abc';
});

afterEach(clearEnv);

describe('resolveCognitoConfig (T-106)', () => {
  it('lê as três obrigatórias e trata o secret como ausente quando não há', () => {
    expect(resolveCognitoConfig()).toEqual({
      region: 'us-east-1',
      userPoolId: 'us-east-1_TESTPOOL',
      clientId: 'client-abc',
      clientSecret: null,
    });
  });

  it('lê o client secret quando existe (o pool pode ter ou não)', () => {
    process.env.COGNITO_CLIENT_SECRET = 'super-secret';
    expect(resolveCognitoConfig().clientSecret).toBe('super-secret');
  });

  it('secret vazio ou só espaço conta como ausente, não como secret vazio', () => {
    process.env.COGNITO_CLIENT_SECRET = '   ';
    expect(resolveCognitoConfig().clientSecret).toBeNull();
  });

  it('apara espaços das variáveis (colar do console da AWS traz sujeira)', () => {
    process.env.COGNITO_REGION = '  sa-east-1 ';
    expect(resolveCognitoConfig().region).toBe('sa-east-1');
  });

  it.each(['COGNITO_REGION', 'COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'])(
    'fail closed: sem %s lança configMissing nomeando a variável',
    (missing) => {
      delete process.env[missing];
      const err = (() => {
        try {
          resolveCognitoConfig();
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(err).toBeInstanceOf(CognitoApiError);
      expect((err as CognitoApiError).code).toBe('configMissing');
      expect((err as Error).message).toContain(missing);
    }
  );

  it('lista TODAS as variáveis que faltam, não só a primeira', () => {
    clearEnv();
    const err = (() => {
      try {
        resolveCognitoConfig();
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err?.message).toContain('COGNITO_REGION');
    expect(err?.message).toContain('COGNITO_USER_POOL_ID');
    expect(err?.message).toContain('COGNITO_CLIENT_ID');
  });

  it('nunca ecoa o client secret na mensagem de erro', () => {
    process.env.COGNITO_CLIENT_SECRET = 'super-secret';
    delete process.env.COGNITO_CLIENT_ID;
    const err = (() => {
      try {
        resolveCognitoConfig();
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err?.message).not.toContain('super-secret');
  });
});
