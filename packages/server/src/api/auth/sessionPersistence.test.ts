import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

// Banco temporário em disco (não `:memory:`) — o teste simula um restart do
// server, que precisa reabrir o MESMO arquivo com um client independente.
// `import` estático de '../../db' seria hoisted acima do set de DATABASE_URL,
// então os módulos são importados dinamicamente dentro do beforeAll (mesmo
// padrão de operations.test.ts).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-session-persistence-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

async function buildApp(): Promise<Express> {
  // Import dinâmico a cada chamada: `../db` cacheia `createClient` no
  // primeiro `require`, então para simular dois processos com clients
  // libsql independentes sobre o mesmo arquivo, seria necessário um novo
  // client por "instância do server". Como o teste roda no mesmo processo
  // Node, usamos `vi`-free approach: cada client aponta pro mesmo arquivo em
  // disco, então a persistência é validada via leitura/escrita no arquivo
  // real (o que é o comportamento que importa: dados sobrevivem a um novo
  // client sobre o mesmo arquivo), não pela identidade do módulo importado.
  const { createClient } = await import('@libsql/client');
  const { SqliteSessionStore } = await import('@vetor-wallet/db');
  const authRouterMod = await import('./router');

  const client = createClient({ url: process.env.DATABASE_URL! });

  const app = express();
  app.use(express.json());
  app.use(
    session({
      name: 'sid',
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      store: new SqliteSessionStore(client),
      cookie: { secure: false, maxAge: 60 * 60 * 1000 },
    })
  );
  app.use('/api/auth', authRouterMod.default);
  return app;
}

describe('sessão sobrevive a "restart" do server (integração com o mesmo arquivo SQLite)', () => {
  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
    await initDb();
  });

  it('login em uma instância é lido por uma segunda instância apontando pro mesmo banco', async () => {
    // Instância 1: registra o usuário e faz login, ganhando o cookie `sid`.
    const appInstance1 = await buildApp();
    const agent1 = request.agent(appInstance1);
    const registerRes = await agent1
      .post('/api/auth/register')
      .send({ email: 'restart@test.com', password: 'password123' });
    expect(registerRes.status).toBe(201);

    const cookies = registerRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // Instância 2: simula o restart — novo client @libsql/client, novo Store,
    // novo app, apontando pro MESMO arquivo de banco. Reaproveita o cookie
    // capturado na instância 1 (supertest não compartilha cookie jar entre
    // agents diferentes).
    const appInstance2 = await buildApp();
    const meRes = await request(appInstance2)
      .get('/api/auth/me')
      .set('Cookie', cookies as unknown as string[]);

    expect(meRes.status).toBe(200);
    expect(meRes.body).toMatchObject({ email: 'restart@test.com' });
  });

  it('logout na segunda instância destrói a sessão (persistida pela primeira)', async () => {
    const appInstance1 = await buildApp();
    const agent1 = request.agent(appInstance1);
    const registerRes = await agent1
      .post('/api/auth/register')
      .send({ email: 'restart-logout@test.com', password: 'password123' });
    const cookies = registerRes.headers['set-cookie'];

    const appInstance2 = await buildApp();
    const logoutRes = await request(appInstance2)
      .post('/api/auth/logout')
      .set('Cookie', cookies as unknown as string[]);
    expect(logoutRes.status).toBe(204);

    const appInstance3 = await buildApp();
    const meRes = await request(appInstance3)
      .get('/api/auth/me')
      .set('Cookie', cookies as unknown as string[]);
    expect(meRes.status).toBe(401);
  });
});
