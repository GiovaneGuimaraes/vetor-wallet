import { COGNITO_MANAGED_PASSWORD_HASH } from 'src/COGNITO_MANAGED_PASSWORD_HASH';
import { createCognitoUser } from 'src/createCognitoUser';
import { createUser } from 'src/createUser';
import { verifyPassword } from 'src/verifyPassword';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('createUser', () => {
  it('normaliza o e-mail e grava hash bcrypt — só o INSERT, sem tocar carteira (T-121)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 11 }] }]);
    const user = await createUser({ query, email: '  Novo@B.COM ', password: 'senha-123' });

    expect(calls[0].text).toBe(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id'
    );
    const [email, hash] = calls[0].values as [string, string];
    expect(email).toBe('novo@b.com');
    expect(await verifyPassword('senha-123', hash)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(user).toMatchObject({ id: 11, email: 'novo@b.com', name: null, phone: null, roles: [] });
  });

  it('sem id devolvido, cai em 0', async () => {
    const { query } = makeTestQuery();
    expect((await createUser({ query, email: 'a@b.com', password: 'senha-123' })).id).toBe(0);
  });
});

describe('createCognitoUser', () => {
  const mirrorRow = {
    id: 21,
    email: 'n@b.com',
    name: null,
    phone: null,
    created_at: 'c',
    roles: '[]',
  };

  it('normaliza o e-mail, grava o sentinela e o sub; só INSERT + SELECT, sem carteira (T-121)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 21 }] }, { rows: [mirrorRow] }]);
    const user = await createCognitoUser({ query, email: '  N@B.com ', cognitoSub: ' sub-n ' });

    expect(calls[0].values).toEqual(['n@b.com', COGNITO_MANAGED_PASSWORD_HASH, 'sub-n']);
    expect(calls).toHaveLength(2);
    expect(calls[1].values).toEqual([21]);
    expect(user.id).toBe(21);
    // o sentinela não é bcrypt: nenhuma senha casa
    expect(await verifyPassword(COGNITO_MANAGED_PASSWORD_HASH, COGNITO_MANAGED_PASSWORD_HASH)).toBe(
      false
    );
  });

  it('sem id devolvido, procura o id 0', async () => {
    const { query, calls } = makeTestQuery([{}, { rows: [{ ...mirrorRow, id: 0 }] }]);
    await createCognitoUser({ query, email: 'n@b.com', cognitoSub: 's' });
    expect(calls[1].values).toEqual([0]);
  });
});
