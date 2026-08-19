import { describe, it, expect } from 'vitest';
import { secretHashFields } from './secretHashFields';
import { computeSecretHash } from './computeSecretHash';
import type { CognitoConfig } from './resolveCognitoConfig';

const WITHOUT_SECRET: CognitoConfig = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_TESTPOOL',
  clientId: 'client-abc',
  clientSecret: null,
};

const WITH_SECRET: CognitoConfig = { ...WITHOUT_SECRET, clientSecret: 'super-secret' };

describe('secretHashFields (T-106)', () => {
  it('pool SEM client secret: nenhum campo (mandar o hash ali é erro na AWS)', () => {
    expect(
      secretHashFields({
        config: WITHOUT_SECRET,
        username: 'alice@example.com',
        key: 'SecretHash',
      })
    ).toEqual({});
    expect(
      secretHashFields({
        config: WITHOUT_SECRET,
        username: 'alice@example.com',
        key: 'SECRET_HASH',
      })
    ).toEqual({});
  });

  it('pool COM secret: `SecretHash` na raiz do corpo (SignUp/ConfirmSignUp/Resend)', () => {
    expect(
      secretHashFields({ config: WITH_SECRET, username: 'alice@example.com', key: 'SecretHash' })
    ).toEqual({
      SecretHash: computeSecretHash({
        username: 'alice@example.com',
        clientId: 'client-abc',
        clientSecret: 'super-secret',
      }),
    });
  });

  it('pool COM secret: `SECRET_HASH` dentro de AuthParameters (InitiateAuth)', () => {
    const fields = secretHashFields({
      config: WITH_SECRET,
      username: 'alice@example.com',
      key: 'SECRET_HASH',
    });
    expect(Object.keys(fields)).toEqual(['SECRET_HASH']);
    expect(fields.SECRET_HASH).toBe(
      computeSecretHash({
        username: 'alice@example.com',
        clientId: 'client-abc',
        clientSecret: 'super-secret',
      })
    );
  });
});
