import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

// Unique on-disk temp DB per test file. Static `import` declarations are
// hoisted above other statements, so setting DATABASE_URL before a static
// `import '../db'` would NOT take effect in time — '../db' captures the URL
// at module-eval time. Route/db modules are therefore imported dynamically
// inside beforeAll, after the env var is set.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-operations-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('operations routes — SELL validation', () => {
  let app: Express;
  let db: typeof import('../db').db;
  let agentA: ReturnType<typeof request.agent>;
  let userAId: number;

  beforeAll(async () => {
    const dbModule = await import('../db');
    const { initDb } = dbModule;
    db = dbModule.db;
    const { default: authRouter } = await import('../auth/router');
    const { default: operationsRouter } = await import('./operations');
    const { errorHandler } = await import('../middleware/errorHandler');

    await initDb();

    app = express();
    app.use(express.json());
    app.use(
      session({
        name: 'sid',
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
      }),
    );
    app.use('/api/auth', authRouter);
    app.use('/api/operations', operationsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    const reg = await agentA
      .post('/api/auth/register')
      .send({ email: 'ops-a@test.com', password: 'password123' });
    userAId = reg.body.id;
  });

  it('rejects SELL for a ticker with no position at all (400)', async () => {
    const res = await agentA
      .post('/api/operations')
      .send({ ticker: 'PETR4', type: 'SELL', quantity: 10, price: 30, date: '2024-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/posicao/i);

    const list = await agentA.get('/api/operations');
    expect(list.body.length).toBe(0);
  });

  it('records a valid BUY', async () => {
    const res = await agentA
      .post('/api/operations')
      .send({ ticker: 'PETR4', type: 'BUY', quantity: 100, price: 30, date: '2024-01-01' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ticker: 'PETR4', type: 'BUY', quantity: 100, price: 30 });
  });

  it('rejects a SELL greater than the current position (400) and persists nothing', async () => {
    const res = await agentA
      .post('/api/operations')
      .send({ ticker: 'PETR4', type: 'SELL', quantity: 200, price: 40, date: '2024-01-02' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/posicao/i);

    const list = await agentA.get('/api/operations');
    // still only the original BUY — the rejected SELL was never inserted
    expect(list.body.length).toBe(1);
    expect(list.body[0].type).toBe('BUY');
  });

  it('records a SELL exactly equal to the current position, zeroing it', async () => {
    const res = await agentA
      .post('/api/operations')
      .send({ ticker: 'PETR4', type: 'SELL', quantity: 100, price: 45, date: '2024-01-03' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ticker: 'PETR4', type: 'SELL', quantity: 100, price: 45 });

    // a further SELL of any amount should now be rejected — position is zero
    const res2 = await agentA
      .post('/api/operations')
      .send({ ticker: 'PETR4', type: 'SELL', quantity: 1, price: 50, date: '2024-01-04' });
    expect(res2.status).toBe(400);
  });

  it('allows a valid partial SELL after a fresh BUY', async () => {
    await agentA
      .post('/api/operations')
      .send({ ticker: 'VALE3', type: 'BUY', quantity: 50, price: 80, date: '2024-02-01' });

    const res = await agentA
      .post('/api/operations')
      .send({ ticker: 'VALE3', type: 'SELL', quantity: 20, price: 90, date: '2024-02-02' });
    expect(res.status).toBe(201);
  });

  it('rejects non-finite quantity (Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/operations')
      .set('Content-Type', 'application/json')
      .send('{"ticker":"ITUB4","type":"BUY","quantity":1e999,"price":30,"date":"2024-03-01"}');
    expect(res.status).toBe(400);
  });

  it('rejects non-finite price (-Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/operations')
      .set('Content-Type', 'application/json')
      .send('{"ticker":"ITUB4","type":"BUY","quantity":10,"price":-1e999,"date":"2024-03-01"}');
    expect(res.status).toBe(400);
  });

  // T-043: DATE_RE sozinho aceita datas com formato válido mas que não
  // existem no calendário — o helper isValidIsoDate rejeita as duas.
  it('rejects a date that does not exist on the calendar (2026-02-30) (400)', async () => {
    const res = await agentA
      .post('/api/operations')
      .send({ ticker: 'ITUB4', type: 'BUY', quantity: 10, price: 30, date: '2026-02-30' });
    expect(res.status).toBe(400);
  });

  it('rejects a nonexistent month (2026-13-01) (400)', async () => {
    const res = await agentA
      .post('/api/operations')
      .send({ ticker: 'ITUB4', type: 'BUY', quantity: 10, price: 30, date: '2026-13-01' });
    expect(res.status).toBe(400);
  });

  // T-050: carteira única — o escopo é o usuário e `wallet_id` do body é ignorado.
  it('ignores wallet_id from the body — the operation is born in the default wallet, even when the id belongs to another user', async () => {
    // carteira de OUTRO usuário, criada direto no banco
    await db.execute({
      sql: "INSERT INTO users (email, password_hash) VALUES ('ops-intruder@test.com', 'x')",
      args: [],
    });
    const other = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: ['ops-intruder@test.com'],
    });
    const otherUserId = Number(other.rows[0].id);
    const otherWallet = await db.execute({
      sql: 'INSERT INTO wallets (user_id, name) VALUES (?, ?)',
      args: [otherUserId, 'Carteira alheia'],
    });
    const otherWalletId = Number(otherWallet.lastInsertRowid);

    const res = await agentA.post('/api/operations').send({
      ticker: 'BBAS3',
      type: 'BUY',
      quantity: 10,
      price: 20,
      date: '2024-04-01',
      wallet_id: otherWalletId,
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.wallet_id)).not.toBe(otherWalletId);

    const { findDefaultWallet } = await import('../services/wallets');
    const own = await findDefaultWallet(userAId);
    expect(Number(res.body.wallet_id)).toBe(Number(own?.id));
  });

  it('validates SELL against ALL of the user operations, including a legacy row in another wallet', async () => {
    // linha legada: 40 ações de EGIE3 numa segunda carteira do próprio usuário
    const legacyWallet = await db.execute({
      sql: 'INSERT INTO wallets (user_id, name) VALUES (?, ?)',
      args: [userAId, 'Carteira legada'],
    });
    const legacyWalletId = Number(legacyWallet.lastInsertRowid);
    await db.execute({
      sql: 'INSERT INTO operations (ticker, type, quantity, price, date, user_id, wallet_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: ['EGIE3', 'BUY', 40, 40, '2024-05-01', userAId, legacyWalletId],
    });

    // 60 na carteira padrão pela rota → consolidado de 100
    await agentA
      .post('/api/operations')
      .send({ ticker: 'EGIE3', type: 'BUY', quantity: 60, price: 41, date: '2024-05-02' });

    // um SELL de 100 é coberto pelo consolidado (40 + 60), mesmo espalhado entre carteiras
    const ok = await agentA
      .post('/api/operations')
      .send({ ticker: 'EGIE3', type: 'SELL', quantity: 100, price: 45, date: '2024-05-03' });
    expect(ok.status).toBe(201);

    // e o excedente segue rejeitado
    const over = await agentA
      .post('/api/operations')
      .send({ ticker: 'EGIE3', type: 'SELL', quantity: 1, price: 45, date: '2024-05-04' });
    expect(over.status).toBe(400);
  });

  it('ignores ?walletId= on GET — the list is always the user consolidated history', async () => {
    const all = await agentA.get('/api/operations');
    const filtered = await agentA.get('/api/operations?walletId=999999');
    expect(filtered.body.length).toBe(all.body.length);
    expect(all.body.length).toBeGreaterThan(0);
  });
});
