import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';
import type { SessionData } from 'express-session';

// Banco temporário próprio por arquivo de teste — mesmo padrão de db.test.ts:
// `import` estático de '../db' seria hoisted acima do set de DATABASE_URL,
// então db/sessionStore são importados dinamicamente dentro do beforeAll.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-session-store-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

type DbModule = typeof import('../db');
type StoreModule = typeof import('./sessionStore');

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    cookie: { originalMaxAge: null, path: '/', httpOnly: true, secure: false } as never,
    userId: 7,
    ...overrides,
  } as SessionData;
}

describe('SqliteSessionStore', () => {
  let db: DbModule['db'];
  let initDb: DbModule['initDb'];
  let SqliteSessionStore: StoreModule['SqliteSessionStore'];

  beforeAll(async () => {
    const dbMod = await import('../db');
    db = dbMod.db;
    initDb = dbMod.initDb;
    const storeMod = await import('./sessionStore');
    SqliteSessionStore = storeMod.SqliteSessionStore;

    await initDb();
  });

  it('roundtrips set/get preserving the JSON payload intact', async () => {
    const store = new SqliteSessionStore(db);
    const session = makeSession({ userId: 123, foo: 'bar' } as never);

    await new Promise<void>((resolve, reject) => {
      store.set('sid-roundtrip', session, (err) => (err ? reject(err) : resolve()));
    });

    const got = await new Promise<SessionData | null | undefined>((resolve, reject) => {
      store.get('sid-roundtrip', (err, s) => (err ? reject(err) : resolve(s)));
    });

    expect(got).toEqual(session);
  });

  it('returns null for a non-existent sid', async () => {
    const store = new SqliteSessionStore(db);

    const got = await new Promise<SessionData | null | undefined>((resolve, reject) => {
      store.get('sid-does-not-exist', (err, s) => (err ? reject(err) : resolve(s)));
    });

    expect(got).toBeNull();
  });

  it('destroy removes the session', async () => {
    const store = new SqliteSessionStore(db);
    const session = makeSession();

    await new Promise<void>((resolve, reject) => {
      store.set('sid-destroy', session, (err) => (err ? reject(err) : resolve()));
    });

    await new Promise<void>((resolve, reject) => {
      store.destroy('sid-destroy', (err) => (err ? reject(err) : resolve()));
    });

    const got = await new Promise<SessionData | null | undefined>((resolve, reject) => {
      store.get('sid-destroy', (err, s) => (err ? reject(err) : resolve(s)));
    });

    expect(got).toBeNull();
  });

  it('touch renews the expiration', async () => {
    const store = new SqliteSessionStore(db);
    const session = makeSession({ cookie: { maxAge: 1000 } as never });

    await new Promise<void>((resolve, reject) => {
      store.set('sid-touch', session, (err) => (err ? reject(err) : resolve()));
    });

    const before = await db.execute({
      sql: 'SELECT expires_at FROM sessions WHERE sid = ?',
      args: ['sid-touch'],
    });
    const expiresBefore = String(before.rows[0].expires_at);

    // Renova com um maxAge maior — expires_at deve avançar.
    await new Promise<void>((resolve, reject) => {
      store.touch(
        'sid-touch',
        { ...session, cookie: { maxAge: 60_000 } as never },
        (err) => (err ? reject(err) : resolve()),
      );
    });

    const after = await db.execute({
      sql: 'SELECT expires_at FROM sessions WHERE sid = ?',
      args: ['sid-touch'],
    });
    const expiresAfter = String(after.rows[0].expires_at);

    expect(new Date(expiresAfter).getTime()).toBeGreaterThan(new Date(expiresBefore).getTime());
  });

  it('get returns null and deletes an expired session (lazy delete)', async () => {
    const store = new SqliteSessionStore(db);
    const session = makeSession();

    await new Promise<void>((resolve, reject) => {
      store.set('sid-expired', session, (err) => (err ? reject(err) : resolve()));
    });

    // Força a expiração diretamente no banco (no passado).
    await db.execute({
      sql: 'UPDATE sessions SET expires_at = ? WHERE sid = ?',
      args: [new Date(Date.now() - 1000).toISOString(), 'sid-expired'],
    });

    const got = await new Promise<SessionData | null | undefined>((resolve, reject) => {
      store.get('sid-expired', (err, s) => (err ? reject(err) : resolve(s)));
    });
    expect(got).toBeNull();

    const row = await db.execute({
      sql: 'SELECT sid FROM sessions WHERE sid = ?',
      args: ['sid-expired'],
    });
    expect(row.rows).toHaveLength(0);
  });

  it('falls back to the default TTL when cookie.maxAge is absent', async () => {
    const store = new SqliteSessionStore(db, { defaultTtlMs: 5_000 });
    const session = makeSession({ cookie: {} as never });

    await new Promise<void>((resolve, reject) => {
      store.set('sid-default-ttl', session, (err) => (err ? reject(err) : resolve()));
    });

    const row = await db.execute({
      sql: 'SELECT expires_at FROM sessions WHERE sid = ?',
      args: ['sid-default-ttl'],
    });
    const expiresAt = new Date(String(row.rows[0].expires_at)).getTime();
    const delta = expiresAt - Date.now();
    // Deve estar próximo do defaultTtlMs (5s), não do maxAge ausente.
    expect(delta).toBeGreaterThan(3_000);
    expect(delta).toBeLessThan(7_000);
  });
});
