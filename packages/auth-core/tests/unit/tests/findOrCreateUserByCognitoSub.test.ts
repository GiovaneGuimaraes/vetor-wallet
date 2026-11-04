import { CognitoLinkRequiresVerifiedEmailError } from 'src/CognitoLinkRequiresVerifiedEmailError';
import { findOrCreateUserByCognitoSub } from 'src/findOrCreateUserByCognitoSub';
import { makeTestQuery } from 'tests/unit/testQuery';

jest.mock('@vetor-wallet/portfolio-core', () => ({
  getOrCreateDefaultWallet: jest.fn(),
}));

const mirrorRow = (id: number, email = 'dono@b.com') => ({
  id,
  email,
  name: null,
  phone: null,
  created_at: 'c',
  roles: '[]',
  cognito_sub: null,
});

describe('findOrCreateUserByCognitoSub', () => {
  it('(1) sub conhecido: devolve sem tocar em mais nada', async () => {
    const { query, calls } = makeTestQuery([{ rows: [mirrorRow(1)] }]);
    const result = await findOrCreateUserByCognitoSub({
      query,
      cognitoSub: ' sub-1 ',
      email: 'dono@b.com',
      emailVerified: false,
    });
    expect(result.outcome).toBe('found-by-sub');
    expect(result.user.id).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].values).toEqual(['sub-1']);
  });

  it('(2) e-mail existente + verificado: vincula (e-mail normalizado)', async () => {
    const { query, calls } = makeTestQuery([{}, { rows: [mirrorRow(2)] }, {}]);
    const result = await findOrCreateUserByCognitoSub({
      query,
      cognitoSub: 'sub-2',
      email: '  Dono@B.com ',
      emailVerified: true,
    });
    expect(result.outcome).toBe('linked-by-email');
    expect(calls[1].values).toEqual(['dono@b.com']);
    expect(calls[2].text).toBe('UPDATE users SET cognito_sub = $1 WHERE id = $2');
    expect(calls[2].values).toEqual(['sub-2', 2]);
  });

  it('(2) e-mail existente SEM verificação: recusa antes de qualquer escrita', async () => {
    const { query, calls } = makeTestQuery([{}, { rows: [mirrorRow(2)] }]);
    await expect(
      findOrCreateUserByCognitoSub({
        query,
        cognitoSub: 'sub-x',
        email: 'dono@b.com',
        emailVerified: false,
      })
    ).rejects.toBeInstanceOf(CognitoLinkRequiresVerifiedEmailError);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => !/^(INSERT|UPDATE)/.test(c.text))).toBe(true);
  });

  it('(3) e-mail novo: cria o espelho, mesmo sem e-mail verificado', async () => {
    const { query, calls } = makeTestQuery([
      {},
      {},
      { rows: [{ id: 9 }] },
      { rows: [mirrorRow(9, 'novo@b.com')] },
    ]);
    const result = await findOrCreateUserByCognitoSub({
      query,
      cognitoSub: 'sub-9',
      email: 'novo@b.com',
      emailVerified: false,
    });
    expect(result.outcome).toBe('created');
    expect(result.user.id).toBe(9);
    expect(calls[2].text).toMatch(/^INSERT INTO users/);
  });
});

describe('CognitoLinkRequiresVerifiedEmailError', () => {
  it('carrega nome e e-mail', () => {
    const err = new CognitoLinkRequiresVerifiedEmailError('a@b.com');
    expect(err.name).toBe('CognitoLinkRequiresVerifiedEmailError');
    expect(err.email).toBe('a@b.com');
    expect(err.message).toContain('a@b.com');
  });
});
