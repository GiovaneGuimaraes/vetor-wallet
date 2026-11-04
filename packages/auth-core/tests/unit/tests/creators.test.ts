import { COGNITO_MANAGED_PASSWORD_HASH } from 'src/COGNITO_MANAGED_PASSWORD_HASH';
import { createCognitoUser } from 'src/createCognitoUser';
import { createUser } from 'src/createUser';
import { verifyPassword } from 'src/verifyPassword';
import { getOrCreateDefaultWallet } from '@vetor-wallet/portfolio-core';
import { makeTestQuery } from 'tests/unit/testQuery';

jest.mock('@vetor-wallet/portfolio-core', () => ({ getOrCreateDefaultWallet: jest.fn() }));

const wallet = getOrCreateDefaultWallet as jest.Mock;

describe('createUser', () => {
  it('normaliza o e-mail, grava hash bcrypt e cria a carteira padrão', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 11 }] }]);
    const user = await createUser({ query, email: '  Novo@B.COM ', password: 'senha-123' });

    expect(calls[0].text).toBe(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id'
    );
    const [email, hash] = calls[0].values as [string, string];
    expect(email).toBe('novo@b.com');
    expect(await verifyPassword('senha-123', hash)).toBe(true);
    expect(wallet).toHaveBeenCalledWith({ query, userId: 11 });
    expect(user).toMatchObject({ id: 11, email: 'novo@b.com', name: null, phone: null, roles: [] });
  });

  it('falha na carteira não derruba o registro', async () => {
    wallet.mockRejectedValueOnce(new Error('boom'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { query } = makeTestQuery([{ rows: [{ id: 12 }] }]);
    const user = await createUser({ query, email: 'a@b.com', password: 'senha-123' });
    expect(user.id).toBe(12);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
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

  it('normaliza o e-mail, grava o sentinela e o sub, e cria a carteira', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 21 }] }, { rows: [mirrorRow] }]);
    const user = await createCognitoUser({ query, email: '  N@B.com ', cognitoSub: ' sub-n ' });

    expect(calls[0].values).toEqual(['n@b.com', COGNITO_MANAGED_PASSWORD_HASH, 'sub-n']);
    expect(wallet).toHaveBeenCalledWith({ query, userId: 21 });
    expect(calls[1].values).toEqual([21]);
    expect(user.id).toBe(21);
    // o sentinela não é bcrypt: nenhuma senha casa
    expect(await verifyPassword(COGNITO_MANAGED_PASSWORD_HASH, COGNITO_MANAGED_PASSWORD_HASH)).toBe(
      false
    );
  });

  it('falha na carteira não derruba o login', async () => {
    wallet.mockRejectedValueOnce(new Error('boom'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { query } = makeTestQuery([{ rows: [{ id: 22 }] }, { rows: [{ ...mirrorRow, id: 22 }] }]);
    expect((await createCognitoUser({ query, email: 'n@b.com', cognitoSub: 's' })).id).toBe(22);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('sem id devolvido, procura o id 0', async () => {
    const { query, calls } = makeTestQuery([{}, { rows: [{ ...mirrorRow, id: 0 }] }]);
    await createCognitoUser({ query, email: 'n@b.com', cognitoSub: 's' });
    expect(calls[1].values).toEqual([0]);
  });
});
