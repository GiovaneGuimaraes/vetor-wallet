import { grantRole } from 'src/grantRole';
import { linkCognitoSub } from 'src/linkCognitoSub';
import { updateUserProfile } from 'src/updateUserProfile';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('updateUserProfile', () => {
  const readRow = {
    id: 5,
    email: 'a@b.com',
    name: 'Ana',
    phone: '11912345678',
    created_at: 'c',
    roles: '[]',
  };

  it('PATCH de name e phone: trima, normaliza e numera os placeholders', async () => {
    const { query, calls } = makeTestQuery([{}, { rows: [readRow] }]);
    const user = await updateUserProfile({
      query,
      userId: 5,
      update: { name: '  Ana ', phone: '(11) 91234-5678' },
    });
    expect(calls[0].text).toBe('UPDATE users SET name = $1, phone = $2 WHERE id = $3');
    expect(calls[0].values).toEqual(['Ana', '11912345678', 5]);
    expect(user?.name).toBe('Ana');
  });

  it('só phone: placeholder começa em $1', async () => {
    const { query, calls } = makeTestQuery([{}, { rows: [readRow] }]);
    await updateUserProfile({ query, userId: 5, update: { phone: '11912345678' } });
    expect(calls[0].text).toBe('UPDATE users SET phone = $1 WHERE id = $2');
  });

  it('null limpa os campos', async () => {
    const { query, calls } = makeTestQuery([{}, { rows: [readRow] }]);
    await updateUserProfile({ query, userId: 5, update: { name: null, phone: null } });
    expect(calls[0].values).toEqual([null, null, 5]);
  });

  it('update vazio não escreve, só lê', async () => {
    const { query, calls } = makeTestQuery([{ rows: [readRow] }]);
    await updateUserProfile({ query, userId: 5, update: {} });
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/^SELECT/);
  });

  it('devolve null se o usuário não existe', async () => {
    const { query } = makeTestQuery();
    expect(await updateUserProfile({ query, userId: 5, update: {} })).toBeNull();
  });
});

describe('grantRole', () => {
  const userRow = (roles: string) => ({
    id: 4,
    email: 'a@b.com',
    name: null,
    phone: null,
    password_hash: 'h',
    created_at: 'c',
    roles,
  });

  it('concede o papel acrescentando aos existentes', async () => {
    const { query, calls } = makeTestQuery([{ rows: [userRow('["x"]')] }, {}]);
    expect(await grantRole({ query, email: 'a@b.com', role: 'admin' })).toEqual({ granted: true });
    expect(calls[1].text).toBe('UPDATE users SET roles = $1 WHERE id = $2');
    expect(calls[1].values).toEqual(['["x","admin"]', 4]);
  });

  it('é idempotente: papel presente não escreve', async () => {
    const { query, calls } = makeTestQuery([{ rows: [userRow('["admin"]')] }]);
    expect(await grantRole({ query, email: 'a@b.com', role: 'admin' })).toEqual({ granted: false });
    expect(calls).toHaveLength(1);
  });

  it('lança para usuário inexistente', async () => {
    const { query } = makeTestQuery();
    await expect(grantRole({ query, email: 'n@b.com', role: 'admin' })).rejects.toThrow(
      'Usuário não encontrado: n@b.com'
    );
  });
});

describe('linkCognitoSub', () => {
  it('grava o sub trimado no usuário', async () => {
    const { query, calls } = makeTestQuery();
    await linkCognitoSub({ query, userId: 2, cognitoSub: ' sub-1 ' });
    expect(calls[0].text).toBe('UPDATE users SET cognito_sub = $1 WHERE id = $2');
    expect(calls[0].values).toEqual(['sub-1', 2]);
  });
});
