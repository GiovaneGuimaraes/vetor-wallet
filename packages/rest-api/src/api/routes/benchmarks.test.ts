import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import { installFakeCognito } from '../auth/__fixtures__/fakeCognito';

// Banco temporário próprio deste arquivo (padrão dos testes de rota).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-benchmarks-root-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

// A rota passa o `fetchQuotes` do brapi-core para o portfolio-core (T-121): o
// mock prova que é a ROTA que costura os dois, sem rede.
vi.mock('@vetor-wallet/brapi-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@vetor-wallet/brapi-core')>();
  return {
    ...original,
    fetchQuotes: vi.fn(async (tickers: string[]) => ({
      quotes: new Map(tickers.map((t) => [t, 12])),
      failed: false,
    })),
  };
});

installFakeCognito();

describe('GET /api/benchmarks (T-121: a rota orquestra portfolio-core + insights-core)', () => {
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: benchmarksRouter } = await import('./benchmarks');
    const { errorHandler } = await import('../middleware/errorHandler');
    await initDb();

    const app: Express = express();
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
    app.use('/api/benchmarks', benchmarksRouter);
    app.use(errorHandler);

    agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'bench-root@test.com', password: 'password123' });
  });

  afterAll(() => vi.unstubAllGlobals());

  it('sem operações: período vazio e tudo null (mesmo corpo de antes)', async () => {
    const res = await agent.get('/api/benchmarks');
    expect(res.status).toBe(200);
    const today = new Date().toISOString().split('T')[0];
    expect(res.body).toEqual({
      period: { from: today, to: today },
      portfolio: null,
      cdi: null,
      ibovespa: null,
    });
  });

  it('com operação: retorno da carteira vem do portfolio-core com a cotação da rota; período parte da 1ª operação', async () => {
    const { db } = await import('@vetor-wallet/db');
    const me = await agent.get('/api/auth/me');
    const wallet = await db.execute({
      sql: 'SELECT id FROM wallets WHERE user_id = ?',
      args: [me.body.id],
    });
    await db.execute({
      sql: `INSERT INTO operations (user_id, wallet_id, ticker, type, quantity, price, date)
            VALUES (?, ?, 'PETR4', 'BUY', 10, 10, '2026-01-02')`,
      args: [me.body.id, wallet.rows[0].id],
    });

    // CDI/Ibovespa: fontes externas fora do ar viram null (política da rota).
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );

    const res = await agent.get('/api/benchmarks');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['cdi', 'ibovespa', 'period', 'portfolio']);
    expect(res.body.period.from).toBe('2026-01-02');
    expect(res.body.portfolio).toBeCloseTo(20, 5);
    expect(res.body.cdi).toBeNull();
    expect(res.body.ibovespa).toBeNull();
  });
});
