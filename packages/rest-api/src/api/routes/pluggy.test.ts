import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import type { PluggyStatusResponse, PluggySyncResponse } from '@vetor-wallet/shared';
import { installFakeCognito } from '../auth/__fixtures__/fakeCognito';

const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-pluggy-route-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

// T-106: o cadastro/login destes testes passa pelo AWS Cognito. O pool falso
// abaixo intercepta o `fetch` para o endpoint do Cognito (e SÓ para ele) e
// responde `UserConfirmed: true`, mantendo `POST /api/auth/register` como a
// forma de conseguir uma sessão. Nenhum teste bate na AWS.
installFakeCognito();

/**
 * Rotas `/api/pluggy/*` (T-089b).
 *
 * O `fetch` global é stubado: nenhum teste fala com a Pluggy de verdade. O
 * stub responde `/auth`, `/connect_token`, `/accounts`, `/transactions` e o
 * `DELETE /items/{id}` — o suficiente para exercitar a orquestração, que é o
 * que esta camada faz (as regras estão testadas nos cores).
 */
describe('/api/pluggy (T-089b)', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let db: Awaited<typeof import('@vetor-wallet/db')>['db'];

  const ITEM_A = 'aaaaaaaa-1111-2222-3333-444444444444';
  const ITEM_B = 'bbbbbbbb-1111-2222-3333-444444444444';

  function jsonResponse(body: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }

  /** Transações que a Pluggy "devolve" — uma despesa real e uma interna (T-088). */
  const PLUGGY_TX = [
    {
      id: 'tx-mercado',
      date: '2026-08-11T00:00:00.000Z',
      description: 'Mercado',
      amount: -237.8,
      type: 'DEBIT',
      category: 'Supermarket',
      currencyCode: 'BRL',
      status: 'POSTED',
    },
    {
      id: 'tx-fatura',
      date: '2026-08-10T00:00:00.000Z',
      description: 'Pagamento de fatura',
      amount: -1280.44,
      type: 'DEBIT',
      category: 'Credit card payment',
      currencyCode: 'BRL',
      status: 'POSTED',
    },
  ];

  function stubPluggy(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/auth')) return jsonResponse({ apiKey: 'jwt-test' });
      if (u.includes('/connect_token')) return jsonResponse({ accessToken: 'tok-abc' });
      if (u.includes('/accounts'))
        return jsonResponse({
          results: [{ id: 'acc-1', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Conta' }],
        });
      if (u.includes('/transactions'))
        return jsonResponse({ results: PLUGGY_TX, page: 1, totalPages: 1 });
      if (u.includes('/items/')) return jsonResponse({}, 204);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: pluggyRouter } = await import('./pluggy');
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
    app.use('/api/pluggy', pluggyRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);
    await agentA
      .post('/api/auth/register')
      .send({ email: 'pluggy-a@test.com', password: 'password123' });
    await agentB
      .post('/api/auth/register')
      .send({ email: 'pluggy-b@test.com', password: 'password123' });
  });

  beforeEach(() => {
    process.env.ENVIRONMENT = 'Staging';
    process.env.PLUGGY_CLIENT_ID = 'client-test';
    process.env.PLUGGY_CLIENT_SECRET = 'secret-test';
    stubPluggy();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.ENVIRONMENT;
    delete process.env.PLUGGY_CLIENT_ID;
    delete process.env.PLUGGY_CLIENT_SECRET;
    await db.execute('DELETE FROM pluggy_items');
    await db.execute('DELETE FROM income_entries');
    await db.execute('DELETE FROM expense_entries');
    await db.execute('DELETE FROM savings_entries');
  });

  // ── Gate ENVIRONMENT ───────────────────────────────────────────────────────

  it('sem sessão responde 401', async () => {
    expect((await request(app).get('/api/pluggy/status')).status).toBe(401);
    expect((await request(app).post('/api/pluggy/connect-token').send({})).status).toBe(401);
  });

  it('em Production o gate BLOQUEIA as rotas de ação (403)', async () => {
    process.env.ENVIRONMENT = 'Production';

    expect((await agentA.post('/api/pluggy/connect-token').send({})).status).toBe(403);
    expect((await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A })).status).toBe(403);
    expect((await agentA.post('/api/pluggy/sync').send({})).status).toBe(403);
    expect((await agentA.delete(`/api/pluggy/items/${ITEM_A}`)).status).toBe(403);
  });

  it('FAIL CLOSED: env ausente ou com typo também bloqueia', async () => {
    for (const value of [undefined, '', 'Staginng']) {
      if (value === undefined) delete process.env.ENVIRONMENT;
      else process.env.ENVIRONMENT = value;
      const res = await agentA.post('/api/pluggy/connect-token').send({});
      expect(res.status, String(value)).toBe(403);
      expect(res.body.code).toBe('PLUGGY_DISABLED');
    }
  });

  it('GET /status responde MESMO bloqueado — é ele que conta ao web', async () => {
    // Se esta rota fosse gateada, o cliente precisaria de uma cópia da flag em
    // VITE_* para saber o que renderizar — a duplicação que a decisão proíbe.
    process.env.ENVIRONMENT = 'Production';
    const res = await agentA.get('/api/pluggy/status');

    expect(res.status).toBe(200);
    expect(res.body as PluggyStatusResponse).toEqual({ enabled: false, items: [] });
  });

  // ── Items ──────────────────────────────────────────────────────────────────

  it('registra o item e passa a listá-lo em /status', async () => {
    const created = await agentA
      .post('/api/pluggy/items')
      .send({ itemId: ITEM_A, connectorId: 200, connectorName: 'MeuPluggy' });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ itemId: ITEM_A, connectorName: 'MeuPluggy' });
    // Numeração interna do banco não é contrato de API.
    expect(created.body.id).toBeUndefined();
    expect(created.body.userId).toBeUndefined();

    const status = await agentA.get('/api/pluggy/status');
    expect((status.body as PluggyStatusResponse).enabled).toBe(true);
    expect((status.body as PluggyStatusResponse).items.map((i) => i.itemId)).toEqual([ITEM_A]);
  });

  it('registrar o MESMO item de novo é idempotente (reconexão)', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    const again = await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });

    expect(again.status).toBe(201);
    const status = await agentA.get('/api/pluggy/status');
    expect((status.body as PluggyStatusResponse).items).toHaveLength(1);
  });

  it('item de OUTRO usuário responde 409 sem dizer de quem é', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    const res = await agentB.post('/api/pluggy/items').send({ itemId: ITEM_A });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ITEM_ALREADY_LINKED');
    expect(JSON.stringify(res.body)).not.toContain('pluggy-a@test.com');
  });

  it('itemId inválido é 400', async () => {
    const res = await agentA.post('/api/pluggy/items').send({ itemId: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ITEM_ID');
  });

  it('isolamento: o item de A não aparece para B', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    await agentB.post('/api/pluggy/items').send({ itemId: ITEM_B });

    const statusB = await agentB.get('/api/pluggy/status');
    expect((statusB.body as PluggyStatusResponse).items.map((i) => i.itemId)).toEqual([ITEM_B]);
  });

  // ── connect-token ──────────────────────────────────────────────────────────

  it('connect-token devolve o accessToken e manda o userId como clientUserId', async () => {
    const res = await agentA.post('/api/pluggy/connect-token').send({});
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('tok-abc');

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const tokenCall = calls.find((c) => String(c[0]).includes('/connect_token'));
    const body = JSON.parse(String(tokenCall?.[1]?.body));
    // `clientUserId` vai DENTRO de `options` — contrato medido na T-087.
    expect(body.options.clientUserId).toEqual(expect.any(String));
    // E-mail não trafega para o browser via token.
    expect(JSON.stringify(body)).not.toContain('pluggy-a@test.com');
  });

  it('connect-token com itemId de OUTRO usuário é 404, não reautenticação', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    const res = await agentB.post('/api/pluggy/connect-token').send({ itemId: ITEM_A });
    expect(res.status).toBe(404);
  });

  // ── DELETE ─────────────────────────────────────────────────────────────────

  it('DELETE revoga na Pluggy E apaga o vínculo', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    const res = await agentA.delete(`/api/pluggy/items/${ITEM_A}`);

    expect(res.status).toBe(204);
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some((c) => String(c[0]).includes(`/items/${ITEM_A}`))).toBe(true);

    const status = await agentA.get('/api/pluggy/status');
    expect((status.body as PluggyStatusResponse).items).toHaveLength(0);
  });

  it('DELETE de item alheio é 404 e NÃO chama a Pluggy', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();

    const res = await agentB.delete(`/api/pluggy/items/${ITEM_A}`);
    expect(res.status).toBe(404);
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some((c) => String(c[0]).includes('/items/'))).toBe(false);
  });

  // ── sync ───────────────────────────────────────────────────────────────────

  it('sem nenhum item conectado responde 409 acionável, não "0 importadas"', async () => {
    const res = await agentA.post('/api/pluggy/sync').send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_PLUGGY_ITEMS');
  });

  it('append importa o gasto real e marca a fatura como interna (T-088)', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    const res = await agentA.post('/api/pluggy/sync').send({});

    expect(res.status).toBe(200);
    const body = res.body as PluggySyncResponse;
    expect(body.mode).toBe('append');
    expect(body.totals).toMatchObject({ imported: 1, internal: 1, rejected: 0 });
    expect(body.wiped).toBeUndefined();

    const rows = await db.execute('SELECT description, amount FROM expense_entries');
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].amount).toBe(237.8);
  });

  it('append de novo reporta duplicata em vez de duplicar lançamento', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    await agentA.post('/api/pluggy/sync').send({});
    const second = await agentA.post('/api/pluggy/sync').send({});

    expect((second.body as PluggySyncResponse).totals).toMatchObject({
      imported: 0,
      duplicated: 1,
    });
    const rows = await db.execute('SELECT COUNT(*) AS c FROM expense_entries');
    expect(Number(rows.rows[0].c)).toBe(1);
  });

  it('replace APAGA tudo do usuário antes de importar, e reporta o que sumiu', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    const userRow = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: ['pluggy-a@test.com'],
    });
    const userId = Number(userRow.rows[0].id);

    await db.execute({
      sql: 'INSERT INTO expense_entries (user_id, description, amount, date, category) VALUES (?, ?, ?, ?, ?)',
      args: [userId, 'Digitado à mão', 55, '2026-01-15', 'outros'],
    });
    await db.execute({
      sql: 'INSERT INTO savings_entries (user_id, type, amount, date) VALUES (?, ?, ?, ?)',
      args: [userId, 'DEPOSIT', 1000, '2026-01-10'],
    });

    const res = await agentA.post('/api/pluggy/sync').send({ mode: 'replace' });

    expect(res.status).toBe(200);
    const body = res.body as PluggySyncResponse;
    expect(body.mode).toBe('replace');
    expect(body.wiped).toEqual({ incomeEntries: 0, expenseEntries: 1, savingsEntries: 1 });

    // O manual sumiu; sobrou só o que a Pluggy trouxe.
    const rows = await db.execute('SELECT description FROM expense_entries');
    expect(rows.rows.map((r) => r.description)).toEqual(['Mercado']);
    // E a poupança NÃO volta — a Pluggy não escreve savings_entries.
    const savings = await db.execute('SELECT COUNT(*) AS c FROM savings_entries');
    expect(Number(savings.rows[0].c)).toBe(0);
  });

  it('replace de A não toca os dados de B', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    const userRowB = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: ['pluggy-b@test.com'],
    });
    await db.execute({
      sql: 'INSERT INTO expense_entries (user_id, description, amount, date, category) VALUES (?, ?, ?, ?, ?)',
      args: [Number(userRowB.rows[0].id), 'Do B', 10, '2026-02-02', 'outros'],
    });

    await agentA.post('/api/pluggy/sync').send({ mode: 'replace' });

    const rows = await db.execute({
      sql: 'SELECT COUNT(*) AS c FROM expense_entries WHERE user_id = ?',
      args: [Number(userRowB.rows[0].id)],
    });
    expect(Number(rows.rows[0].c)).toBe(1);
  });

  it('mode desconhecido é 400 — nunca vira append em silêncio', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    const res = await agentA.post('/api/pluggy/sync').send({ mode: 'REPLACE' });

    expect(res.status).toBe(400);
    // E nada foi apagado nem importado.
    const rows = await db.execute('SELECT COUNT(*) AS c FROM expense_entries');
    expect(Number(rows.rows[0].c)).toBe(0);
  });

  it('dateFrom irreal é 400', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    const res = await agentA.post('/api/pluggy/sync').send({ dateFrom: '2026-02-30' });
    expect(res.status).toBe(400);
  });

  it('falha da Pluggy vira 502 com mensagem acionável, não 500 genérico', async () => {
    await agentA.post('/api/pluggy/items').send({ itemId: ITEM_A });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/auth')) return jsonResponse({ apiKey: 'jwt-test' });
        return jsonResponse({ message: 'boom' }, 500);
      })
    );

    const res = await agentA.post('/api/pluggy/connect-token').send({});
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('PLUGGY_UNAVAILABLE');
  });
});
