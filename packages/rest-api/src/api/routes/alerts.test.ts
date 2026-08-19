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
  `vetor-wallet-test-alerts-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

// T-106: o cadastro/login destes testes passa pelo AWS Cognito. O pool falso
// abaixo intercepta o `fetch` para o endpoint do Cognito (e SÓ para ele) e
// responde `UserConfirmed: true`, mantendo `POST /api/auth/register` como a
// forma de conseguir uma sessão. Nenhum teste bate na AWS.
installFakeCognito();

describe('alerts routes', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: alertsRouter } = await import('./alerts');
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
      })
    );
    app.use('/api/auth', authRouter);
    app.use('/api/alerts', alertsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);

    await agentA
      .post('/api/auth/register')
      .send({ email: 'alerts-a@test.com', password: 'password123' });
    await agentB
      .post('/api/auth/register')
      .send({ email: 'alerts-b@test.com', password: 'password123' });
  });

  it('returns 401 without session', async () => {
    const res = await request(app).get('/api/alerts');
    expect(res.status).toBe(401);
  });

  it('rejects creation with empty ticker (400)', async () => {
    const res = await agentA
      .post('/api/alerts')
      .send({ ticker: '', type: 'PRICE_ABOVE', threshold: 30 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with invalid type (400)', async () => {
    const res = await agentA
      .post('/api/alerts')
      .send({ ticker: 'PETR4', type: 'INVALID', threshold: 30 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with threshold <= 0 (400)', async () => {
    const res = await agentA
      .post('/api/alerts')
      .send({ ticker: 'PETR4', type: 'PRICE_ABOVE', threshold: 0 });
    expect(res.status).toBe(400);
  });

  // Ordem das validações (sugestão da T-052): threshold <= 0 responde com a
  // mensagem antiga ("maior que 0"), não a de casas decimais — a checagem de
  // sinal/finitude roda ANTES da de granularidade.
  it('rejects threshold <= 0 with the "maior que 0" message, not the decimals one', async () => {
    const res = await agentA
      .post('/api/alerts')
      .send({ ticker: 'PETR4', type: 'PRICE_ABOVE', threshold: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maior que 0/);
    expect(res.body.error).not.toMatch(/casas decimais/);
  });

  // T-059: mesmo padrão da T-052 (isValidMoneyAmount), agora também em threshold.
  it('rejects threshold with more than 2 decimal places (400)', async () => {
    const res = await agentA
      .post('/api/alerts')
      .send({ ticker: 'PETR4', type: 'PRICE_ABOVE', threshold: 0.125 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2 casas decimais/);
  });

  it('rejects creation with non-finite threshold (Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/alerts')
      .set('Content-Type', 'application/json')
      .send('{"ticker":"PETR4","type":"PRICE_ABOVE","threshold":1e999}');
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-finite threshold (-Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/alerts')
      .set('Content-Type', 'application/json')
      .send('{"ticker":"PETR4","type":"PRICE_ABOVE","threshold":-1e999}');
    expect(res.status).toBe(400);
  });

  it('creates an alert rule', async () => {
    const res = await agentA
      .post('/api/alerts')
      .send({ ticker: 'petr4', type: 'PRICE_ABOVE', threshold: 35.5 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ticker: 'PETR4', type: 'PRICE_ABOVE', threshold: 35.5 });
  });

  // T-065: rejeita threshold absurdamente grande (limite explícito de isValidMoneyAmount).
  it('rejects threshold above the maximum money amount (400)', async () => {
    const res = await agentA
      .post('/api/alerts')
      .send({ ticker: 'PETR4', type: 'PRICE_ABOVE', threshold: 1e14 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limite máximo/);
  });

  // T-065: o re-SELECT pós-INSERT do POST agora filtra por user_id (simetria com
  // operations/T-051) — a criação de A não deve nunca conseguir devolver a linha
  // de outro usuário, mesmo que os ids colidissem por acaso.
  it('the created row returned by POST always belongs to the requesting user', async () => {
    const resA = await agentA
      .post('/api/alerts')
      .send({ ticker: 'MGLU3', type: 'PRICE_ABOVE', threshold: 12 });
    expect(resA.status).toBe(201);

    const listA = await agentA.get('/api/alerts');
    expect(listA.body.some((item: { id: number }) => item.id === resA.body.id)).toBe(true);

    const listB = await agentB.get('/api/alerts');
    expect(listB.body.some((item: { id: number }) => item.id === resA.body.id)).toBe(false);
  });

  it('lists only the requesting user alert rules', async () => {
    await agentB.post('/api/alerts').send({ ticker: 'VALE3', type: 'PRICE_BELOW', threshold: 60 });

    const resA = await agentA.get('/api/alerts');
    expect(resA.status).toBe(200);
    expect(resA.body.every((item: { ticker: string }) => item.ticker !== 'VALE3')).toBe(true);

    const resB = await agentB.get('/api/alerts');
    expect(resB.status).toBe(200);
    expect(resB.body.some((item: { ticker: string }) => item.ticker === 'VALE3')).toBe(true);
  });

  it('deletes an alert rule belonging to the user', async () => {
    const created = await agentA
      .post('/api/alerts')
      .send({ ticker: 'ITUB4', type: 'CHANGE_PCT', threshold: 5 });
    const id = created.body.id;

    const del = await agentA.delete(`/api/alerts/${id}`);
    expect(del.status).toBe(204);

    const list = await agentA.get('/api/alerts');
    expect(list.body.some((item: { id: number }) => item.id === id)).toBe(false);
  });

  it('returns 404 when deleting another user alert rule', async () => {
    const created = await agentB
      .post('/api/alerts')
      .send({ ticker: 'BBAS3', type: 'ALLOCATION_PCT', threshold: 10 });
    const id = created.body.id;

    const del = await agentA.delete(`/api/alerts/${id}`);
    expect(del.status).toBe(404);
  });
});
