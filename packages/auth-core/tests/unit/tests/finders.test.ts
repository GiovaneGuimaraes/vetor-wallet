import { findUserByCognitoSub } from 'src/findUserByCognitoSub';
import { findUserByEmail } from 'src/findUserByEmail';
import { findUserById } from 'src/findUserById';
import { userExists } from 'src/userExists';
import { makeTestQuery } from 'tests/unit/testQuery';

const row = {
  id: 3,
  email: 'a@b.com',
  name: null,
  phone: null,
  password_hash: 'h',
  created_at: 'c',
  roles: '["admin"]',
};

describe('findUserByEmail', () => {
  it('normaliza o e-mail e devolve o usuário com password_hash', async () => {
    const { query, calls } = makeTestQuery([{ rows: [row] }]);
    const user = await findUserByEmail({ query, email: '  A@B.com ' });
    expect(calls[0].values).toEqual(['a@b.com']);
    expect(user).toEqual({
      id: 3,
      email: 'a@b.com',
      name: null,
      phone: null,
      password_hash: 'h',
      created_at: 'c',
      roles: ['admin'],
    });
  });

  it('devolve null sem linha', async () => {
    const { query } = makeTestQuery();
    expect(await findUserByEmail({ query, email: 'x@y.com' })).toBeNull();
  });
});

describe('findUserById', () => {
  it('devolve o usuário com password_hash', async () => {
    const { query, calls } = makeTestQuery([{ rows: [row] }]);
    const user = await findUserById({ query, userId: 3 });
    expect(calls[0].values).toEqual([3]);
    expect(user?.password_hash).toBe('h');
    expect(user?.roles).toEqual(['admin']);
  });

  it('devolve null sem linha', async () => {
    const { query } = makeTestQuery();
    expect(await findUserById({ query, userId: 1 })).toBeNull();
  });
});

describe('userExists', () => {
  it('normaliza o e-mail e reflete a presença de linha', async () => {
    const found = makeTestQuery([{ rows: [{ id: 1 }] }]);
    expect(await userExists({ query: found.query, email: ' A@B.com' })).toBe(true);
    expect(found.calls[0].values).toEqual(['a@b.com']);

    const none = makeTestQuery();
    expect(await userExists({ query: none.query, email: 'a@b.com' })).toBe(false);
  });
});

describe('findUserByCognitoSub', () => {
  it('trima o sub e devolve o usuário sem password_hash', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ ...row, cognito_sub: 's' }] }]);
    const user = await findUserByCognitoSub({ query, cognitoSub: ' s ' });
    expect(calls[0].values).toEqual(['s']);
    expect(user).toEqual({
      id: 3,
      email: 'a@b.com',
      name: null,
      phone: null,
      created_at: 'c',
      roles: ['admin'],
    });
  });

  it('devolve null para sub desconhecido', async () => {
    const { query } = makeTestQuery();
    expect(await findUserByCognitoSub({ query, cognitoSub: 'x' })).toBeNull();
  });
});
