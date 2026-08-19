import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import { installFakeCognito, type FakeCognitoPool } from './__fixtures__/fakeCognito';

// Banco temporário próprio deste arquivo (padrão dos testes de rota).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-cognito-auth-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

type DbModule = typeof import('@vetor-wallet/db');

async function buildApp(): Promise<Express> {
  const { default: authRouter } = await import('./router');
  const { errorHandler } = await import('../middleware/errorHandler');

  const app = express();
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
  return app;
}

let dbModule: DbModule;

beforeAll(async () => {
  dbModule = await import('@vetor-wallet/db');
  await dbModule.initDb();
});

describe('registro no pool que EXIGE confirmação de e-mail (T-106)', () => {
  let app: Express;
  let pool: FakeCognitoPool;

  beforeAll(async () => {
    pool = installFakeCognito({ autoConfirm: false });
    app = await buildApp();
  });

  afterAll(() => pool.restore());

  it('responde 202 pendingConfirmation, SEM sessão e SEM linha em users', async () => {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/register')
      .send({ email: 'Pendente@Example.com', password: 'senha-forte-1' });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ pendingConfirmation: true, email: 'pendente@example.com' });

    // Sem sessão: o cadastro não logou ninguém.
    expect((await agent.get('/api/auth/me')).status).toBe(401);

    // E o espelho local ainda não existe — ele nasce no primeiro login.
    const rows = await dbModule.db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: ['pendente@example.com'],
    });
    expect(rows.rows.length).toBe(0);
  });

  it('login antes de confirmar responde 403 USER_NOT_CONFIRMED (não "senha errada")', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'naoconfirmado@example.com', password: 'senha-forte-1' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'naoconfirmado@example.com', password: 'senha-forte-1' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('USER_NOT_CONFIRMED');
  });

  it('confirma com o código e o login passa a funcionar', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'confirmavel@example.com', password: 'senha-forte-1' });

    const wrong = await request(app)
      .post('/api/auth/confirm')
      .send({ email: 'confirmavel@example.com', code: '000000' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('INVALID_CODE');

    const ok = await request(app)
      .post('/api/auth/confirm')
      .send({ email: ' Confirmavel@Example.com ', code: ' 123456 ' });
    expect(ok.status).toBe(204);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'confirmavel@example.com', password: 'senha-forte-1' });
    expect(login.status).toBe(200);
    expect(login.body.email).toBe('confirmavel@example.com');
  });

  it('reenvia o código (204) e recusa e-mail sem cadastro com 401', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'reenvio@example.com', password: 'senha-forte-1' });

    expect(
      (await request(app).post('/api/auth/resend-code').send({ email: 'reenvio@example.com' }))
        .status
    ).toBe(204);

    // `UserNotFoundException` responde o mesmo que credencial inválida: não
    // entregamos um oráculo de "este e-mail tem conta aqui".
    const unknown = await request(app)
      .post('/api/auth/resend-code')
      .send({ email: 'ninguem@example.com' });
    expect(unknown.status).toBe(401);
  });

  it('valida o corpo de /confirm e /resend-code antes de falar com a AWS', async () => {
    expect((await request(app).post('/api/auth/confirm').send({ code: '123456' })).status).toBe(
      400
    );
    expect(
      (await request(app).post('/api/auth/confirm').send({ email: 'nao-e-email', code: '1' }))
        .status
    ).toBe(400);
    expect(
      (await request(app).post('/api/auth/confirm').send({ email: 'a@b.com', code: '  ' })).status
    ).toBe(400);
    expect((await request(app).post('/api/auth/resend-code').send({})).status).toBe(400);
  });
});

describe('registro no pool SEM confirmação de e-mail (T-106)', () => {
  let app: Express;
  let pool: FakeCognitoPool;

  beforeAll(async () => {
    pool = installFakeCognito({ autoConfirm: true });
    app = await buildApp();
  });

  afterAll(() => pool.restore());

  it('responde 201 já autenticado, com pendingConfirmation: false', async () => {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/register')
      .send({ email: 'direto@example.com', password: 'senha-forte-1' });

    expect(res.status).toBe(201);
    expect(res.body.pendingConfirmation).toBe(false);
    expect(res.body.email).toBe('direto@example.com');
    expect(res.body.roles).toEqual([]);
    expect(res.body.password_hash).toBeUndefined();

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('direto@example.com');
  });

  it('grava o cognito_sub e NÃO grava senha utilizável no banco', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'espelho@example.com', password: 'senha-forte-1' });

    const row = await dbModule.db.execute({
      sql: 'SELECT cognito_sub, password_hash FROM users WHERE email = ?',
      args: ['espelho@example.com'],
    });
    expect(row.rows[0].cognito_sub).toBe('sub-espelho@example.com');
    expect(row.rows[0].password_hash).toBe('cognito-managed:no-local-password');
  });

  it('e-mail já cadastrado no pool responde 409', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'duplicado@example.com', password: 'senha-forte-1' });

    const again = await request(app)
      .post('/api/auth/register')
      .send({ email: 'duplicado@example.com', password: 'senha-forte-1' });
    expect(again.status).toBe(409);
  });

  it('valida e-mail e tamanho de senha antes de chamar o Cognito', async () => {
    const chamadasAntes = pool.calls.length;

    expect((await request(app).post('/api/auth/register').send({ password: 'x' })).status).toBe(
      400
    );
    expect(
      (await request(app).post('/api/auth/register').send({ email: 'sem-arroba', password: 'x' }))
        .status
    ).toBe(400);
    expect(
      (await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'curta' }))
        .status
    ).toBe(400);

    expect(pool.calls.length).toBe(chamadasAntes);
  });

  it('login errado é 401 genérico; e-mail inexistente responde igual', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'senha@example.com', password: 'senha-forte-1' });

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'senha@example.com', password: 'errada-mas-longa' });
    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inexistente@example.com', password: 'senha-forte-1' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(unknownUser.body.error).toBe(wrongPassword.body.error);
  });

  it('login sem corpo completo é 400 sem falar com a AWS', async () => {
    const chamadasAntes = pool.calls.length;
    expect((await request(app).post('/api/auth/login').send({ email: 'a@b.com' })).status).toBe(
      400
    );
    expect(pool.calls.length).toBe(chamadasAntes);
  });

  it('logout destrói a sessão (e os tokens do Cognito morrem com ela)', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'saida@example.com', password: 'senha-forte-1' });
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});

describe('vínculo da conta que já existia (T-106)', () => {
  let app: Express;
  let pool: FakeCognitoPool;

  beforeAll(async () => {
    pool = installFakeCognito({ autoConfirm: true });
    app = await buildApp();
  });

  afterAll(() => pool.restore());

  it('primeiro login por Cognito adota a conta local casando o e-mail normalizado', async () => {
    // Conta "pré-Cognito": criada como as antigas (bcrypt, sem cognito_sub) e
    // com dado do usuário pendurado nela.
    const { createUser } = await import('@vetor-wallet/auth-core');
    const legacy = await createUser('Legado@Example.com', 'senha-antiga-1');
    await dbModule.db.execute({
      sql: 'INSERT INTO income_sources (user_id, name, amount) VALUES (?, ?, ?)',
      args: [legacy.id, 'Salario', 123],
    });

    // O mesmo e-mail, com OUTRA caixa, cadastrado no pool.
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email: 'LEGADO@example.COM', password: 'senha-nova-1' });

    // Cadastrar não é recusado por já existir localmente: é assim que a conta
    // antiga ganha identidade no pool.
    expect(registered.status).toBe(201);
    expect(registered.body.id).toBe(legacy.id);

    const row = await dbModule.db.execute({
      sql: 'SELECT cognito_sub, email FROM users WHERE id = ?',
      args: [legacy.id],
    });
    expect(row.rows[0].cognito_sub).toBe('sub-legado@example.com');
    expect(row.rows[0].email).toBe('legado@example.com');

    // Nada de conta paralela, e o dado do usuário no lugar.
    const users = await dbModule.db.execute({
      sql: "SELECT COUNT(*) as n FROM users WHERE lower(email) = 'legado@example.com'",
      args: [],
    });
    expect(Number(users.rows[0].n)).toBe(1);

    const income = await dbModule.db.execute({
      sql: 'SELECT COUNT(*) as n FROM income_sources WHERE user_id = ?',
      args: [legacy.id],
    });
    expect(Number(income.rows[0].n)).toBe(1);

    // Login seguinte cai no caminho "achou pelo sub" e devolve o MESMO id.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'legado@example.com', password: 'senha-nova-1' });
    expect(login.status).toBe(200);
    expect(login.body.id).toBe(legacy.id);
  });

  it('a senha ANTIGA do banco não entra mais: quem valida é o Cognito', async () => {
    const { createUser } = await import('@vetor-wallet/auth-core');
    await createUser('somente-local@example.com', 'senha-do-banco-1');

    // Existe em `users` com bcrypt válido, mas não existe no pool.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'somente-local@example.com', password: 'senha-do-banco-1' });
    expect(res.status).toBe(401);
  });
});

describe('troca de senha sobre o Cognito (T-094 + T-106)', () => {
  let app: Express;
  let pool: FakeCognitoPool;

  beforeAll(async () => {
    pool = installFakeCognito({ autoConfirm: true });
    app = await buildApp();
  });

  afterAll(() => pool.restore());

  it('troca a senha, mantém a sessão viva e a senha nova é a que loga', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'troca@example.com', password: 'senha-forte-1' });

    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'senha-forte-1', newPassword: 'senha-forte-2' });
    expect(res.status).toBe(204);

    // Invariante da T-094: a sessão NÃO é invalidada.
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'troca@example.com', password: 'senha-forte-1' })
      ).status
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'troca@example.com', password: 'senha-forte-2' })
      ).status
    ).toBe(200);
  });

  it('senha atual errada é 400 com mensagem genérica', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'errada@example.com', password: 'senha-forte-1' });

    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'nao-e-essa', newPassword: 'senha-forte-2' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Senha atual invalida');
  });

  it('access token vencido é renovado pelo refresh e a troca funciona', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'renova@example.com', password: 'senha-forte-1' });

    // Simula a passagem de 1h: o access token da sessão não vale mais.
    pool.expireAccessTokens();

    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'senha-forte-1', newPassword: 'senha-forte-2' });
    expect(res.status).toBe(204);

    // A sessão segue válida e usável (o token novo ficou guardado nela).
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    const again = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'senha-forte-2', newPassword: 'senha-forte-3' });
    expect(again.status).toBe(204);
  });

  it('refresh também morto: 401 pedindo login novo, sem acusar a senha do usuário', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'morto@example.com', password: 'senha-forte-1' });

    pool.expireAccessTokens();
    pool.expireRefreshTokens();

    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'senha-forte-1', newPassword: 'senha-forte-2' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('COGNITO_SESSION_REQUIRED');
  });

  it('senha nova curta é 400 no nosso lado, antes de qualquer chamada à AWS', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'politica@example.com', password: 'senha-forte-1' });

    const chamadasAntes = pool.calls.length;
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'senha-forte-1', newPassword: 'curta' });
    expect(res.status).toBe(400);
    expect(pool.calls.length).toBe(chamadasAntes);
  });

  it('401 sem sessão e 400 com corpo incompleto', async () => {
    expect(
      (
        await request(app)
          .post('/api/auth/change-password')
          .send({ currentPassword: 'a', newPassword: 'senha-forte-2' })
      ).status
    ).toBe(401);

    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'corpo@example.com', password: 'senha-forte-1' });
    expect(
      (await agent.post('/api/auth/change-password').send({ currentPassword: 'senha-forte-1' }))
        .status
    ).toBe(400);
  });

  it('sessão sem token do Cognito (criada antes da T-106) responde 401 acionável', async () => {
    // Monta um app com uma sessão "legada": tem userId, não tem token.
    const { createUser } = await import('@vetor-wallet/auth-core');
    const legacy = await createUser('sessao-legada@example.com', 'senha-antiga-1');

    const legacyApp = express();
    legacyApp.use(express.json());
    legacyApp.use(
      session({
        name: 'sid',
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
      })
    );
    legacyApp.use((req, _res, next) => {
      req.session.userId = legacy.id;
      next();
    });
    const { default: authRouter } = await import('./router');
    legacyApp.use('/api/auth', authRouter);

    const res = await request(legacyApp)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'senha-antiga-1', newPassword: 'senha-forte-2' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('COGNITO_SESSION_REQUIRED');
  });
});

describe('app client COM client secret (T-106)', () => {
  let app: Express;
  let pool: FakeCognitoPool;

  beforeAll(async () => {
    // O pool falso EXIGE o SECRET_HASH correto em toda chamada — se o router
    // esquecer o hash em qualquer operação, o teste falha aqui.
    pool = installFakeCognito({ autoConfirm: true, clientSecret: 'segredo-do-app-client' });
    app = await buildApp();
  });

  afterAll(() => pool.restore());

  it('cadastro, login e troca de senha funcionam com SECRET_HASH', async () => {
    const agent = request.agent(app);
    const registered = await agent
      .post('/api/auth/register')
      .send({ email: 'comsecret@example.com', password: 'senha-forte-1' });
    expect(registered.status).toBe(201);

    const changed = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'senha-forte-1', newPassword: 'senha-forte-2' });
    expect(changed.status).toBe(204);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'comsecret@example.com', password: 'senha-forte-2' });
    expect(login.status).toBe(200);

    // E o hash foi realmente enviado (não é um pool que aceita qualquer coisa).
    const signUpCall = pool.calls.find(([action]) => action === 'SignUp');
    expect(signUpCall?.[1].SecretHash).toBeTruthy();
    const loginCall = pool.calls.find(([action]) => action === 'InitiateAuth');
    expect(loginCall?.[1].AuthParameters.SECRET_HASH).toBeTruthy();
  });

  it('refresh no fluxo com secret também leva o SECRET_HASH', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'refresh-secret@example.com', password: 'senha-forte-1' });

    pool.expireAccessTokens();
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'senha-forte-1', newPassword: 'senha-forte-2' });
    expect(res.status).toBe(204);

    const refreshCall = pool.calls.find(
      ([action, body]) => action === 'InitiateAuth' && body.AuthFlow === 'REFRESH_TOKEN_AUTH'
    );
    expect(refreshCall?.[1].AuthParameters.SECRET_HASH).toBeTruthy();
  });
});

describe('fail closed sem configuração do Cognito (T-106)', () => {
  let app: Express;
  let pool: FakeCognitoPool;

  beforeAll(async () => {
    pool = installFakeCognito({ autoConfirm: true });
    app = await buildApp();
    delete process.env.COGNITO_CLIENT_ID;
  });

  afterAll(() => pool.restore());

  it('registro, login, confirmação e reenvio respondem 503 AUTH_UNAVAILABLE', async () => {
    const chamadasAntes = pool.calls.length;

    for (const [path, body] of [
      ['/api/auth/register', { email: 'sem-config@example.com', password: 'senha-forte-1' }],
      ['/api/auth/login', { email: 'sem-config@example.com', password: 'senha-forte-1' }],
      ['/api/auth/confirm', { email: 'sem-config@example.com', code: '123456' }],
      ['/api/auth/resend-code', { email: 'sem-config@example.com' }],
    ] as [string, Record<string, string>][]) {
      const res = await request(app).post(path).send(body);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('AUTH_UNAVAILABLE');
    }

    // Fail closed de verdade: nenhuma request saiu para a AWS.
    expect(pool.calls.length).toBe(chamadasAntes);
  });
});
