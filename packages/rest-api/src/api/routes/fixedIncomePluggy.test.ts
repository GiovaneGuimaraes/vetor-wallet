import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import type { PluggyFixedIncomeResponse } from '@vetor-wallet/shared';
import { installFakeCognito } from '../auth/__fixtures__/fakeCognito';

const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-fixed-income-pluggy-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

installFakeCognito();

/**
 * `GET /api/fixed-income/pluggy` (T-091d, fatia d2): Renda Fixa da conexão
 * bancária lida AO VIVO, nunca gravada. O `fetch` global é stubado depois do
 * cadastro (que passa pelo Cognito falso) — nenhum teste fala com a Pluggy.
 *
 * Valores INVENTADOS — nenhum dado financeiro real entra em arquivo versionado.
 */
describe('GET /api/fixed-income/pluggy (T-091d, fatia d2)', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let userIdA: number;
  let db: Awaited<typeof import('@vetor-wallet/db')>['db'];
  let linkPluggyItem: Awaited<typeof import('@vetor-wallet/bank-import-core')>['linkPluggyItem'];
  let resetApiKeyCache: () => void;

  const ITEM_OK = 'aaaaaaaa-1111-2222-3333-444444444444';
  const ITEM_BROKEN = 'bbbbbbbb-1111-2222-3333-444444444444';

  const INVESTMENTS = [
    {
      id: 'inv-cdb',
      itemId: ITEM_OK,
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      name: 'CDB Exemplo',
      currencyCode: 'BRL',
      balance: 1100,
      amountOriginal: 1000,
      rateType: 'CDI',
      rate: 100,
      date: '2026-10-01T00:00:00.000Z',
      dueDate: '2028-01-31T00:00:00.000Z',
      issuer: 'Banco Emissor',
    },
    { id: 'inv-acao', itemId: ITEM_OK, type: 'EQUITY', name: 'Ação Exemplo', balance: 500 },
    { id: 'inv-fundo', itemId: ITEM_OK, type: 'MUTUAL_FUND', name: 'Fundo Exemplo', balance: 300 },
  ];

  function jsonResponse(body: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }

  /** Item OK responde investimentos; ITEM_BROKEN responde 500 (Pluggy com problema). */
  function stubPluggy(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/auth')) return jsonResponse({ apiKey: 'jwt-test' });
      if (u.includes('/investments') && u.includes(ITEM_BROKEN)) return jsonResponse({}, 500);
      if (u.includes('/investments'))
        return jsonResponse({ results: INVESTMENTS, page: 1, total: 3, totalPages: 1 });
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: fixedIncomeRouter } = await import('./fixedIncome');
    const { errorHandler } = await import('../middleware/errorHandler');
    ({ linkPluggyItem } = await import('@vetor-wallet/bank-import-core'));
    ({ _resetPluggyApiKeyCache: resetApiKeyCache } = await import('@vetor-wallet/pluggy-core'));

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
    app.use('/api/fixed-income', fixedIncomeRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);
    const resA = await agentA
      .post('/api/auth/register')
      .send({ email: 'fi-pluggy-a@test.com', password: 'password123' });
    userIdA = resA.body.id as number;
    await agentB
      .post('/api/auth/register')
      .send({ email: 'fi-pluggy-b@test.com', password: 'password123' });
  });

  beforeEach(() => {
    process.env.ENVIRONMENT = 'Staging';
    process.env.PLUGGY_CLIENT_ID = 'client-test';
    process.env.PLUGGY_CLIENT_SECRET = 'secret-test';
    resetApiKeyCache();
    stubPluggy();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.ENVIRONMENT;
    delete process.env.PLUGGY_CLIENT_ID;
    delete process.env.PLUGGY_CLIENT_SECRET;
    await db.execute('DELETE FROM pluggy_items');
    await db.execute('DELETE FROM fixed_income_positions');
  });

  async function countRows(table: string): Promise<number> {
    const result = await db.execute(`SELECT COUNT(*) AS n FROM ${table}`);
    return Number(result.rows[0].n);
  }

  it('responde 401 sem sessão', async () => {
    expect((await request(app).get('/api/fixed-income/pluggy')).status).toBe(401);
  });

  it('integração desligada (ENVIRONMENT ≠ Staging): enabled false, sem chamar a Pluggy', async () => {
    process.env.ENVIRONMENT = 'Production';
    await linkPluggyItem({ db, userId: userIdA, itemId: ITEM_OK });
    const fetchMock = stubPluggy();

    const res = await agentA.get('/api/fixed-income/pluggy');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      enabled: false,
      connections: 0,
      failedConnections: 0,
      positions: [],
      otherInvestments: 0,
    } satisfies PluggyFixedIncomeResponse);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('usuário sem conexão: connections 0 e nenhuma chamada à Pluggy', async () => {
    const fetchMock = stubPluggy();

    const res = await agentB.get('/api/fixed-income/pluggy');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      enabled: true,
      connections: 0,
      failedConnections: 0,
      positions: [],
      otherInvestments: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com conexão: devolve só FIXED_INCOME traduzido e conta os outros tipos', async () => {
    await linkPluggyItem({ db, userId: userIdA, itemId: ITEM_OK });

    const res = await agentA.get('/api/fixed-income/pluggy');

    expect(res.status).toBe(200);
    const body = res.body as PluggyFixedIncomeResponse;
    expect(body).toMatchObject({ enabled: true, connections: 1, failedConnections: 0 });
    expect(body.otherInvestments).toBe(2);
    expect(body.positions).toEqual([
      {
        name: 'CDB Exemplo',
        subtype: 'CDB',
        institution: 'Banco Emissor',
        investedAmount: 1000,
        currentValue: 1100,
        currentValueDate: '2026-10-01',
        maturityDate: '2028-01-31',
        rateType: 'CDI',
        rate: 100,
      },
    ]);
    // itemId é credencial portadora: nunca desce para o cliente.
    expect(JSON.stringify(body)).not.toContain(ITEM_OK);
  });

  it('nunca grava: nenhuma linha nova em fixed_income_positions nem em lançamentos', async () => {
    await linkPluggyItem({ db, userId: userIdA, itemId: ITEM_OK });
    const before = {
      fixed: await countRows('fixed_income_positions'),
      income: await countRows('income_entries'),
      expense: await countRows('expense_entries'),
      savings: await countRows('savings_entries'),
    };

    const res = await agentA.get('/api/fixed-income/pluggy');
    expect(res.body.positions).toHaveLength(1);

    expect({
      fixed: await countRows('fixed_income_positions'),
      income: await countRows('income_entries'),
      expense: await countRows('expense_entries'),
      savings: await countRows('savings_entries'),
    }).toEqual(before);
  });

  it('item que falha não derruba os outros: 200, failedConnections 1, posições do item bom', async () => {
    await linkPluggyItem({ db, userId: userIdA, itemId: ITEM_OK });
    await linkPluggyItem({ db, userId: userIdA, itemId: ITEM_BROKEN });

    const res = await agentA.get('/api/fixed-income/pluggy');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: true, connections: 2, failedConnections: 1 });
    expect(res.body.positions).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(ITEM_BROKEN);
  });

  it('Pluggy fora do ar (rede): 200 com failedConnections, nunca 500/502', async () => {
    await linkPluggyItem({ db, userId: userIdA, itemId: ITEM_OK });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );

    const res = await agentA.get('/api/fixed-income/pluggy');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      enabled: true,
      connections: 1,
      failedConnections: 1,
      positions: [],
    });
  });

  it('credencial da Pluggy ausente conta como falha da conexão, não como 500', async () => {
    await linkPluggyItem({ db, userId: userIdA, itemId: ITEM_OK });
    delete process.env.PLUGGY_CLIENT_SECRET;

    const res = await agentA.get('/api/fixed-income/pluggy');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ connections: 1, failedConnections: 1, positions: [] });
  });

  it('isolamento: com a Pluggy fora do ar, o GET da RF manual segue intacto', async () => {
    await linkPluggyItem({ db, userId: userIdA, itemId: ITEM_OK });
    const created = await agentA.post('/api/fixed-income').send({
      name: 'CDB manual',
      kind: 'CDB',
      investedAmount: 500,
      investedAt: '2026-01-10',
      rateType: 'PRE',
      rate: 10,
    });
    expect(created.status).toBe(201);
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);

    const manual = await agentA.get('/api/fixed-income');

    expect(manual.status).toBe(200);
    expect(manual.body.positions).toHaveLength(1);
    expect(manual.body.summary).toEqual({ totalInvested: 500, totalCurrent: 500 });
    // O GET da RF manual não sabe que a Pluggy existe.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('conexão de outro usuário não aparece', async () => {
    await linkPluggyItem({ db, userId: userIdA, itemId: ITEM_OK });

    const res = await agentB.get('/api/fixed-income/pluggy');

    expect(res.body).toMatchObject({ connections: 0, positions: [] });
  });
});
