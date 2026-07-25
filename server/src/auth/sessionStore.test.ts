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
  let cleanupExpiredSessions: StoreModule['cleanupExpiredSessions'];

  beforeAll(async () => {
    const dbMod = await import('../db');
    db = dbMod.db;
    initDb = dbMod.initDb;
    const storeMod = await import('./sessionStore');
    SqliteSessionStore = storeMod.SqliteSessionStore;
    cleanupExpiredSessions = storeMod.cleanupExpiredSessions;

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

  // T-046: robustez de sessões — varredura de boot, expires_at corrompido e
  // maxAge <= 0.

  it('cleanupExpiredSessions deletes only rows whose expires_at is at or before "at" (boot sweep)', async () => {
    await db.execute({
      sql: 'INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)',
      args: ['sid-sweep-expired', '{}', new Date(Date.now() - 60_000).toISOString()],
    });
    await db.execute({
      sql: 'INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)',
      args: ['sid-sweep-valid', '{}', new Date(Date.now() + 60_000).toISOString()],
    });

    const deleted = await cleanupExpiredSessions(db, new Date());
    expect(deleted).toBeGreaterThanOrEqual(1);

    const expiredRow = await db.execute({
      sql: 'SELECT sid FROM sessions WHERE sid = ?',
      args: ['sid-sweep-expired'],
    });
    expect(expiredRow.rows).toHaveLength(0);

    const validRow = await db.execute({
      sql: 'SELECT sid FROM sessions WHERE sid = ?',
      args: ['sid-sweep-valid'],
    });
    expect(validRow.rows).toHaveLength(1);

    // Limpeza do lançamento auxiliar para não vazar entre testes.
    await db.execute({ sql: 'DELETE FROM sessions WHERE sid = ?', args: ['sid-sweep-valid'] });
  });

  it('get fails closed (treats as expired) when expires_at is corrupted/non-ISO, without throwing', async () => {
    const store = new SqliteSessionStore(db);

    await db.execute({
      sql: 'INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)',
      args: ['sid-corrupted', JSON.stringify(makeSession()), 'not-a-valid-date'],
    });

    const got = await new Promise<SessionData | null | undefined>((resolve, reject) => {
      store.get('sid-corrupted', (err, s) => (err ? reject(err) : resolve(s)));
    });
    expect(got).toBeNull();

    const row = await db.execute({
      sql: 'SELECT sid FROM sessions WHERE sid = ?',
      args: ['sid-corrupted'],
    });
    expect(row.rows).toHaveLength(0);
  });

  it('set with cookie.maxAge <= 0 expires the session immediately, not the default TTL', async () => {
    const store = new SqliteSessionStore(db, { defaultTtlMs: 60 * 60 * 1000 });
    const session = makeSession({ cookie: { maxAge: 0 } as never });

    await new Promise<void>((resolve, reject) => {
      store.set('sid-maxage-zero', session, (err) => (err ? reject(err) : resolve()));
    });

    const row = await db.execute({
      sql: 'SELECT expires_at FROM sessions WHERE sid = ?',
      args: ['sid-maxage-zero'],
    });
    const expiresAt = new Date(String(row.rows[0].expires_at)).getTime();
    expect(expiresAt).toBeLessThanOrEqual(Date.now());

    // A leitura seguinte já enxerga a sessão como expirada (lazy-delete).
    const got = await new Promise<SessionData | null | undefined>((resolve, reject) => {
      store.get('sid-maxage-zero', (err, s) => (err ? reject(err) : resolve(s)));
    });
    expect(got).toBeNull();
  });

  it('touch with a negative cookie.maxAge also expires the session immediately', async () => {
    const store = new SqliteSessionStore(db, { defaultTtlMs: 60 * 60 * 1000 });
    const session = makeSession({ cookie: { maxAge: 1000 } as never });

    await new Promise<void>((resolve, reject) => {
      store.set('sid-touch-negative', session, (err) => (err ? reject(err) : resolve()));
    });

    await new Promise<void>((resolve, reject) => {
      store.touch(
        'sid-touch-negative',
        { ...session, cookie: { maxAge: -5 } as never },
        (err) => (err ? reject(err) : resolve()),
      );
    });

    const row = await db.execute({
      sql: 'SELECT expires_at FROM sessions WHERE sid = ?',
      args: ['sid-touch-negative'],
    });
    const expiresAt = new Date(String(row.rows[0].expires_at)).getTime();
    expect(expiresAt).toBeLessThanOrEqual(Date.now());
  });
});
