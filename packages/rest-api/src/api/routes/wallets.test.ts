import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import { installFakeCognito } from '../auth/__fixtures__/fakeCognito';

// Unique on-disk temp DB per test file. Static `import` declarations are
// hoisted above other statements, so setting DATABASE_URL before a static
// `import '../../db'` would NOT take effect in time — '../../db' captures the URL
// at module-eval time. Route/db modules are therefore imported dynamically
// inside beforeAll, after the env var is set.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-wallets-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

// T-106: o cadastro/login destes testes passa pelo AWS Cognito. O pool falso
// abaixo intercepta o `fetch` para o endpoint do Cognito (e SÓ para ele) e
// responde `UserConfirmed: true`, mantendo `POST /api/auth/register` como a
// forma de conseguir uma sessão. Nenhum teste bate na AWS.
installFakeCognito();

describe('wallets routes — carteira única (T-050)', () => {
  let app: Express;
  let db: typeof import('@vetor-wallet/db').db;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let userAId: number;

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: walletsRouter } = await import('./wallets');
    const { default: operationsRouter } = await import('./operations');
    const { errorHandler } = await import('../middleware/errorHandler');

    db = dbModule.db;
    await dbModule.initDb();

    app = express();
    app.use(express.json());
    app.use(
      session({
        name: 'sid',
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
      })
    );
    app.use('/api/auth', authRouter);
    app.use('/api/wallets', walletsRouter);
    app.use('/api/operations', operationsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    const reg = await agentA
      .post('/api/auth/register')
      .send({ email: 'wallets-a@test.com', password: 'password123' });
    userAId = reg.body.id;

    agentB = request.agent(app);
    await agentB
      .post('/api/auth/register')
      .send({ email: 'wallets-b@test.com', password: 'password123' });
  });

  it('creates the default wallet at register time', async () => {
    const res = await agentA.get('/api/wallets');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: 'Carteira B3 pessoal', color: '#e3d5b8' });
  });

  it('GET is idempotent — two GETs do not create a second wallet', async () => {
    const first = await agentA.get('/api/wallets');
    const second = await agentA.get('/api/wallets');
    expect(second.body).toHaveLength(1);
    expect(second.body[0].id).toBe(first.body[0].id);
  });

  it('rejects creating a second wallet with 400', async () => {
    const res = await agentA.post('/api/wallets').send({ name: 'Carteira B' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/já tem uma carteira/i);

    const list = await agentA.get('/api/wallets');
    expect(list.body).toHaveLength(1);
  });

  it('still validates name before the single-wallet rule', async () => {
    const res = await agentA.post('/api/wallets').send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('isolates users — B has its own single wallet, untouched by A', async () => {
    const listB = await agentB.get('/api/wallets');
    expect(listB.body).toHaveLength(1);
    expect(listB.body[0].id).not.toBe((await agentA.get('/api/wallets')).body[0].id);

    // B also cannot create a second one
    const res = await agentB.post('/api/wallets').send({ name: 'Outra' });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/wallets/:id no longer exists (404)', async () => {
    const list = await agentA.get('/api/wallets');
    const res = await agentA.delete(`/api/wallets/${list.body[0].id}`);
    expect(res.status).toBe(404);
  });

  it('lists legacy extra wallets but still refuses to create new ones', async () => {
    // legacy row inserted straight into the DB, as a pre-T-050 base would have
    await db.execute({
      sql: 'INSERT INTO wallets (user_id, name, description, color) VALUES (?, ?, ?, ?)',
      args: [userAId, 'Carteira legada', '', '#000000'],
    });

    const list = await agentA.get('/api/wallets');
    expect(list.body).toHaveLength(2);

    const res = await agentA.post('/api/wallets').send({ name: 'Mais uma' });
    expect(res.status).toBe(400);
  });

  it('adopts legacy operations with wallet_id NULL on the first wallet resolution', async () => {
    // user with no wallet at all and an orphan operation — exactly the pre-wallets state
    await db.execute({
      sql: "INSERT INTO users (email, password_hash) VALUES ('legacy@test.com', 'x')",
      args: [],
    });
    const userRow = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: ['legacy@test.com'],
    });
    const legacyUserId = Number(userRow.rows[0].id);

    await db.execute({
      sql: 'INSERT INTO operations (ticker, type, quantity, price, date, user_id, wallet_id) VALUES (?, ?, ?, ?, ?, ?, NULL)',
      args: ['PETR4', 'BUY', 10, 30, '2024-01-01', legacyUserId],
    });

    const { getOrCreateDefaultWallet } = await import('@vetor-wallet/portfolio-core');
    const walletId = await getOrCreateDefaultWallet(legacyUserId);

    const ops = await db.execute({
      sql: 'SELECT wallet_id FROM operations WHERE user_id = ?',
      args: [legacyUserId],
    });
    expect(ops.rows).toHaveLength(1);
    expect(Number(ops.rows[0].wallet_id)).toBe(walletId);

    // and calling again does not create a second wallet
    expect(await getOrCreateDefaultWallet(legacyUserId)).toBe(walletId);
  });

  // T-065: dois POSTs simultâneos do mesmo usuário não podem criar 2 carteiras
  // — antes do lock por usuário (withUserLock), "countWallets == 0" era
  // checado pelos dois requests antes de qualquer INSERT rodar.
  it('two concurrent POSTs from the same user do not create two wallets', async () => {
    const agentD = request.agent(app);
    const reg = await agentD
      .post('/api/auth/register')
      .send({ email: 'wallets-d@test.com', password: 'password123' });
    const userDId = Number(reg.body.id);

    // createUser (T-050a) already gave this user a default wallet — delete it
    // so this test exercises the race from the pre-wallets state.
    await db.execute({ sql: 'DELETE FROM wallets WHERE user_id = ?', args: [userDId] });

    const [resX, resY] = await Promise.all([
      agentD.post('/api/wallets').send({ name: 'Carteira X' }),
      agentD.post('/api/wallets').send({ name: 'Carteira Y' }),
    ]);

    const statuses = [resX.status, resY.status].sort();
    expect(statuses).toEqual([201, 400]);

    const list = await agentD.get('/api/wallets');
    expect(list.body).toHaveLength(1);
  });

  it('POST creates via getOrCreateDefaultWallet and adopts orphan operations (T-053)', async () => {
    const agentC = request.agent(app);
    const reg = await agentC
      .post('/api/auth/register')
      .send({ email: 'wallets-c@test.com', password: 'password123' });
    const userCId = Number(reg.body.id);

    // createUser (T-050a) already gave this user a default wallet — delete it so
    // this test exercises POST /api/wallets from the pre-wallets state (no wallet
    // at all), same as a legacy user would hit before this endpoint existed.
    await db.execute({ sql: 'DELETE FROM wallets WHERE user_id = ?', args: [userCId] });

    await db.execute({
      sql: 'INSERT INTO operations (ticker, type, quantity, price, date, user_id, wallet_id) VALUES (?, ?, ?, ?, ?, ?, NULL)',
      args: ['VALE3', 'BUY', 5, 60, '2024-02-01', userCId],
    });

    const res = await agentC.post('/api/wallets').send({
      name: 'Carteira Real',
      description: 'via POST',
      color: '#123456',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Carteira Real',
      description: 'via POST',
      color: '#123456',
    });

    const ops = await db.execute({
      sql: 'SELECT wallet_id FROM operations WHERE user_id = ?',
      args: [userCId],
    });
    expect(ops.rows).toHaveLength(1);
    expect(Number(ops.rows[0].wallet_id)).toBe(Number(res.body.id));
  });
});
