import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

// Banco temporário próprio por arquivo de teste (mesmo padrão de profile.test.ts).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-change-password-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('POST /api/auth/change-password (T-094)', () => {
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
      .send({ email: 'change-pw@test.com', password: 'password123' });
  });

  it('returns 401 without session', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'password123', newPassword: 'newpassword123' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an incomplete body', async () => {
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'password123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the new password is too short', async () => {
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'password123', newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('returns 400 with a generic message when the current password is wrong', async () => {
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'wrong-password', newPassword: 'newpassword123' });
    expect(res.status).toBe(400);
    expect(res.body.error).not.toMatch(/usuario/i);
  });

  it('changes the password: new one logs in, old one fails, session stays valid', async () => {
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'password123', newPassword: 'newpassword123' });
    expect(res.status).toBe(204);

    // Sessão atual segue logada sem precisar de novo login.
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'change-pw@test.com', password: 'password123' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'change-pw@test.com', password: 'newpassword123' });
    expect(newLogin.status).toBe(200);
  });
});
