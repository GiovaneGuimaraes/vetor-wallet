import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

// Prova, contra SQLite REAL e pela ponte `createSqliteQuery`, o que o mock de
// `query` do auth-core não alcança (T-116a): o SQL e a tradução `$N` -> `?`.
// DATABASE_URL antes do `await import` — o client lê o env no top-level.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-auth-core-sqlite-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('auth-core contra SQLite real', () => {
  let core: typeof import('@vetor-wallet/auth-core');
  let query: ReturnType<(typeof import('@vetor-wallet/query'))['createSqliteQuery']>;

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    await dbModule.initDb();
    const { createSqliteQuery } = await import('@vetor-wallet/query');
    query = createSqliteQuery(dbModule.db);
    core = await import('@vetor-wallet/auth-core');
  });

  it('linkCognitoSub sobrescreve um sub anterior (conta apagada e recriada no pool)', async () => {
    const user = await core.createCognitoUser({
      query,
      email: 'relink@example.com',
      cognitoSub: 'sub-antigo',
    });
    await core.linkCognitoSub({ query, userId: user.id, cognitoSub: 'sub-novo' });

    expect(await core.findUserByCognitoSub({ query, cognitoSub: 'sub-antigo' })).toBeNull();
    expect((await core.findUserByCognitoSub({ query, cognitoSub: 'sub-novo' }))?.id).toBe(user.id);
  });

  it('createUser/findUserById/userExists/updateUserPassword', async () => {
    const created = await core.createUser({
      query,
      email: 'Local@Example.com',
      password: 'senha-antiga-1',
    });
    expect(created.id).toBeGreaterThan(0);
    expect(await core.userExists({ query, email: ' LOCAL@example.com ' })).toBe(true);
    expect(await core.userExists({ query, email: 'ninguem@example.com' })).toBe(false);

    const found = await core.findUserById({ query, userId: created.id });
    expect(found?.email).toBe('local@example.com');
    expect(await core.verifyPassword('senha-antiga-1', found!.password_hash)).toBe(true);

    await core.updateUserPassword({ query, userId: created.id, newPassword: 'senha-nova-22' });
    const after = await core.findUserById({ query, userId: created.id });
    expect(await core.verifyPassword('senha-nova-22', after!.password_hash)).toBe(true);
    expect(await core.verifyPassword('senha-antiga-1', after!.password_hash)).toBe(false);
  });

  it('grantRole persiste, é idempotente e lança para e-mail desconhecido', async () => {
    await core.createUser({ query, email: 'admin@example.com', password: 'senha-12345' });
    expect(await core.grantRole({ query, email: 'ADMIN@example.com', role: 'admin' })).toEqual({
      granted: true,
    });
    expect(await core.grantRole({ query, email: 'admin@example.com', role: 'admin' })).toEqual({
      granted: false,
    });
    const user = await core.findUserByEmail({ query, email: 'admin@example.com' });
    expect(user?.roles).toEqual(['admin']);
    await expect(core.grantRole({ query, email: 'x@example.com', role: 'admin' })).rejects.toThrow(
      'Usuário não encontrado'
    );
  });

  it('updateUserProfile numera $N corretamente no SQLite e limpa com null', async () => {
    const u = await core.createUser({
      query,
      email: 'perfil@example.com',
      password: 'senha-12345',
    });
    const updated = await core.updateUserProfile({
      query,
      userId: u.id,
      update: { name: '  Ana ', phone: '(11) 91234-5678' },
    });
    expect(updated).toMatchObject({ name: 'Ana', phone: '11912345678' });
    const cleared = await core.updateUserProfile({ query, userId: u.id, update: { phone: null } });
    expect(cleared).toMatchObject({ name: 'Ana', phone: null });
  });

  it('o mesmo sub não vira duas contas: segundo createCognitoUser falha (índice único)', async () => {
    await core.createCognitoUser({ query, email: 'dup-a@example.com', cognitoSub: 'sub-dup' });
    await expect(
      core.createCognitoUser({ query, email: 'dup-b@example.com', cognitoSub: 'sub-dup' })
    ).rejects.toThrow();
  });
});
