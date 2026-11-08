import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import { readFileSync, writeFileSync, rmSync } from 'fs';
import { installFakeCognito } from './auth/__fixtures__/fakeCognito';
import { FORBIDDEN_LOG_KEY_PARTS, sanitizeLogFields } from './sanitizeLogFields';
import { log } from './logger';

// T-122 — logger estruturado. O critério que manda aqui: NENHUM valor/saldo/
// estabelecimento/e-mail/senha/token/cookie/itemId chega à saída.

const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const testDbPath = path.join(tmpdir(), `vetor-wallet-test-logging-${unique}.db`);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;
const logFile = path.join(tmpdir(), `vetor-wallet-test-logging-${unique}.ndjson`);

installFakeCognito();

function readLog(): Record<string, unknown>[] {
  const raw = readFileSync(logFile, 'utf8').trim();
  return raw ? raw.split('\n').map((l) => JSON.parse(l)) : [];
}

beforeEach(() => {
  writeFileSync(logFile, '');
  process.env.LOG_FILE = logFile;
});

afterAll(() => {
  delete process.env.LOG_FILE;
  rmSync(logFile, { force: true });
});

describe('sanitizeLogFields', () => {
  // Chaves proibidas em várias grafias: se uma passar, o teste falha.
  const FORBIDDEN = [
    'email',
    'userEmail',
    'password',
    'senha',
    'token',
    'accessToken',
    'refresh_token',
    'cookie',
    'Set-Cookie',
    'authorization',
    'itemId',
    'item_id',
    'amount',
    'totalAmount',
    'value',
    'price',
    'balance',
    'saldo',
    'quantity',
    'description',
    'merchant',
    'establishment',
    'estabelecimento',
    'fitid',
    'externalId',
    'ticker',
    'name',
    'sid',
    'apiKey',
    'secret',
  ];

  it.each(FORBIDDEN)('derruba a chave proibida %s (valor nunca sai)', (key) => {
    const { fields, redacted } = sanitizeLogFields({ [key]: 'VALOR-SENSIVEL', ok: 1 });
    expect(JSON.stringify(fields)).not.toContain('VALOR-SENSIVEL');
    expect(fields).toEqual({ ok: 1 });
    expect(redacted).toEqual([key]);
  });

  it('a lista de teste cobre toda parte proibida da denylist', () => {
    for (const part of FORBIDDEN_LOG_KEY_PARTS) {
      const { redacted } = sanitizeLogFields({ [`x_${part}_y`]: 'v' });
      expect(redacted).toHaveLength(1);
    }
  });

  it('só primitivos passam: objeto e array são derrubados, string é truncada', () => {
    const { fields, redacted } = sanitizeLogFields({
      nested: { email: 'a@b.com' },
      list: ['a@b.com'],
      n: 3,
      b: true,
      nul: null,
      nan: NaN,
      absent: undefined,
      long: 'x'.repeat(500),
    });
    expect(Object.keys(fields).sort()).toEqual(['b', 'long', 'n', 'nul']);
    expect((fields.long as string).length).toBe(200);
    expect(redacted.sort()).toEqual(['list', 'nan', 'nested']);
  });
});

describe('log()', () => {
  it('escreve uma linha NDJSON em LOG_FILE (append) com ts, level e event', () => {
    log('info', 'teste.um', { n: 1 });
    log('warn', 'teste.dois');
    const lines = readLog();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ level: 'info', event: 'teste.um', n: 1 });
    expect(typeof lines[0].ts).toBe('string');
    expect(lines[1]).toMatchObject({ level: 'warn', event: 'teste.dois' });
  });

  it('campos não sobrescrevem event/level, e chave proibida nunca chega ao arquivo', () => {
    log('info', 'real', { event: 'falso', level: 'error', email: 'x@y.com', password: 'hunter2' });
    const [line] = readLog();
    expect(line.event).toBe('real');
    expect(line.level).toBe('info');
    expect(line.redacted).toEqual(['email', 'password']);
    const raw = readFileSync(logFile, 'utf8');
    expect(raw).not.toContain('x@y.com');
    expect(raw).not.toContain('hunter2');
  });

  it('sem LOG_FILE vai para stdout; erro vai para stderr', () => {
    delete process.env.LOG_FILE;
    const out: string[] = [];
    const err: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (s: string) => out.push(s);
    console.error = (s: string) => err.push(s);
    try {
      log('info', 'no.stdout');
      log('error', 'no.stderr');
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
    expect(JSON.parse(out[0]).event).toBe('no.stdout');
    expect(JSON.parse(err[0]).event).toBe('no.stderr');
  });

  it('não lança quando LOG_FILE é inválido', () => {
    process.env.LOG_FILE = path.join(tmpdir(), 'nao-existe-dir-xyz', 'a.log');
    expect(() => log('info', 'x')).not.toThrow();
  });
});

describe('requestLogger + eventos de domínio nas rotas', () => {
  let app: Express;

  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
    await initDb();
    const { default: authRouter } = await import('./auth/router');
    const { default: operationsRouter } = await import('./routes/operations');
    const { errorHandler } = await import('./middleware/errorHandler');
    const { requestLogger } = await import('./middleware/requestLogger');

    app = express();
    app.use(requestLogger);
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
    app.use('/api/operations', operationsRouter);
    app.get('/boom', () => {
      throw Object.assign(new Error('SELECT * FROM x WHERE email = joao@secreto.com'), {
        code: 'E_BOOM',
      });
    });
    app.use(errorHandler);
  });

  it('http.request: método, rota-template (sem query/params), status, durationMs, requestId', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: `log-tpl-${unique}@test.com`, password: 'password123' });
    writeFileSync(logFile, '');
    const res = await agent.delete('/api/operations/12345?token=abc&email=a@b.com');
    expect(res.status).toBe(404);
    const [line] = readLog().filter((l) => l.event === 'http.request');
    expect(line).toMatchObject({
      method: 'DELETE',
      route: '/api/operations/:id',
      status: 404,
    });
    expect(typeof line.userId).toBe('number');
    expect(typeof line.durationMs).toBe('number');
    expect(line.requestId).toBe(res.headers['x-request-id']);
    const raw = readFileSync(logFile, 'utf8');
    expect(raw).not.toContain('12345');
    expect(raw).not.toContain('abc');
    expect(raw).not.toContain('a@b.com');
  });

  it('barrado pelo requireAuth: rota vira o prefixo de montagem, sem o id da URL', async () => {
    const res = await request(app).delete('/api/operations/12345');
    expect(res.status).toBe(401);
    const [line] = readLog();
    expect(line).toMatchObject({ route: '/api/operations/*', status: 401 });
    expect(line.userId).toBeUndefined();
    expect(readFileSync(logFile, 'utf8')).not.toContain('12345');
  });

  it('rota sem handler vira "unmatched" (a URL crua não entra)', async () => {
    await request(app).get('/api/segredo-12345?x=1');
    const [line] = readLog();
    expect(line).toMatchObject({ route: 'unmatched', status: 404 });
    expect(readFileSync(logFile, 'utf8')).not.toContain('segredo');
  });

  it('login válido: auth.login.ok só com userId; sem e-mail, senha, token nem cookie', async () => {
    const email = `log-ok-${unique}@test.com`;
    const password = 'senha-super-secreta-1';
    await request(app).post('/api/auth/register').send({ email, password });
    writeFileSync(logFile, '');

    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);

    const lines = readLog();
    const ok = lines.find((l) => l.event === 'auth.login.ok');
    expect(ok).toMatchObject({ level: 'info', userId: res.body.id });
    const req = lines.find((l) => l.event === 'http.request');
    expect(req).toMatchObject({ route: '/api/auth/login', status: 200, userId: res.body.id });

    const raw = readFileSync(logFile, 'utf8');
    expect(raw).not.toContain(email);
    expect(raw).not.toContain(password);
    expect(raw).not.toContain('sid=');
    expect(raw).not.toMatch(/access|refresh/i);
  });

  it('login recusado: auth.login.failed só com o código do erro', async () => {
    const email = `log-fail-${unique}@test.com`;
    const password = 'outra-senha-secreta-2';
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const failed = readLog().find((l) => l.event === 'auth.login.failed');
    expect(failed).toMatchObject({ level: 'warn' });
    expect(typeof failed?.code).toBe('string');
    const raw = readFileSync(logFile, 'utf8');
    expect(raw).not.toContain(email);
    expect(raw).not.toContain(password);
  });

  it('login sem campos: auth.login.failed MISSING_FIELDS', async () => {
    await request(app).post('/api/auth/login').send({});
    expect(readLog().find((l) => l.event === 'auth.login.failed')).toMatchObject({
      code: 'MISSING_FIELDS',
    });
  });

  it('operation.created: id local e tipo, sem ticker, quantidade nem preço', async () => {
    const email = `log-op-${unique}@test.com`;
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({ email, password: 'password123' });
    writeFileSync(logFile, '');

    const res = await agent
      .post('/api/operations')
      .send({ ticker: 'ZZZZ99', type: 'BUY', quantity: 7777, price: 31.37, date: '2024-01-01' });
    expect(res.status).toBe(201);

    const lines = readLog();
    const created = lines.find((l) => l.event === 'operation.created');
    expect(created).toMatchObject({
      userId: reg.body.id,
      operationId: res.body.id,
      operationType: 'BUY',
    });
    const http = lines.find((l) => l.event === 'http.request');
    expect(http).toMatchObject({ method: 'POST', route: '/api/operations', status: 201 });

    const raw = readFileSync(logFile, 'utf8');
    for (const secret of ['ZZZZ99', '7777', '31.37']) expect(raw).not.toContain(secret);
  });

  it('errorHandler: 500 + http.unhandled_error sem a message do erro', async () => {
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    const err = readLog().find((l) => l.event === 'http.unhandled_error');
    expect(err).toMatchObject({ level: 'error', errorKind: 'Error', errorCode: 'E_BOOM' });
    expect(err?.requestId).toBe(res.headers['x-request-id']);
    expect(readFileSync(logFile, 'utf8')).not.toContain('joao@secreto.com');
  });
});
