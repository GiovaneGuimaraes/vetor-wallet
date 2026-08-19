import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import { installFakeCognito } from './__fixtures__/fakeCognito';

// Banco temporário próprio por arquivo de teste. `import` estático de '../../db'
// seria hoisted acima do set de DATABASE_URL, então os módulos são importados
// dinamicamente dentro do beforeAll (mesmo padrão dos demais testes de rota).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-profile-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

// T-106: o cadastro/login destes testes passa pelo AWS Cognito. O pool falso
// abaixo intercepta o `fetch` para o endpoint do Cognito (e SÓ para ele) e
// responde `UserConfirmed: true`, mantendo `POST /api/auth/register` como a
// forma de conseguir uma sessão. Nenhum teste bate na AWS.
installFakeCognito();

describe('PATCH /api/auth/me (T-092)', () => {
  let app: Express;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('./router');
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
    app.use(errorHandler);

    agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'profile-a@test.com', password: 'password123' });
  });

  it('returns 401 without session', async () => {
    const res = await request(app).patch('/api/auth/me').send({ name: 'Ana' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an empty body', async () => {
    const res = await agent.patch('/api/auth/me').send({});
    expect(res.status).toBe(400);
  });

  it('GET /me initially returns name and phone as null', async () => {
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: null, phone: null });
    expect(res.body).toHaveProperty('created_at');
  });

  it('updates name and phone with a valid PATCH', async () => {
    const res = await agent
      .patch('/api/auth/me')
      .send({ name: 'Ana Silva', phone: '(11) 98765-4321' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ana Silva');
    expect(res.body.phone).toBe('11987654321');
  });

  it('GET /me reflects the update', async () => {
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ana Silva');
    expect(res.body.phone).toBe('11987654321');
  });

  it('rejects an invalid name', async () => {
    const res = await agent.patch('/api/auth/me').send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid phone', async () => {
    const res = await agent.patch('/api/auth/me').send({ phone: '123' });
    expect(res.status).toBe(400);
  });

  it('clears name and phone by sending null', async () => {
    const res = await agent.patch('/api/auth/me').send({ name: null, phone: null });
    expect(res.status).toBe(200);
    expect(res.body.name).toBeNull();
    expect(res.body.phone).toBeNull();

    const getRes = await agent.get('/api/auth/me');
    expect(getRes.body.name).toBeNull();
    expect(getRes.body.phone).toBeNull();
  });

  it('updates a single field, leaving the other untouched', async () => {
    await agent.patch('/api/auth/me').send({ name: 'Carlos' });
    const res = await agent.patch('/api/auth/me').send({ phone: '11987654321' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Carlos');
    expect(res.body.phone).toBe('11987654321');
  });

  it('does not allow editing email via PATCH', async () => {
    const res = await agent.patch('/api/auth/me').send({ email: 'hacked@test.com', name: 'X' });
    expect(res.status).toBe(200);
    const getRes = await agent.get('/api/auth/me');
    expect(getRes.body.email).toBe('profile-a@test.com');
  });
});
