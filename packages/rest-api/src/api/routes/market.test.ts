import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import { installFakeCognito } from '../auth/__fixtures__/fakeCognito';

const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-market-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;
installFakeCognito();

// A brapi nunca é chamada de verdade: o universo vem deste mock.
// Impl em função comum (não vi.fn().mockRejectedValue): ver PluggyImportModal.test.tsx.
let universeImpl: () => Promise<unknown> = async () => ({ quotes: [], fetchedAt: 0 });
let historyImpl: (ticker: string) => Promise<unknown> = async () => ({});
const historyCalls: string[] = [];
vi.mock('@vetor-wallet/brapi-core', async () => {
  const actual = await vi.importActual<typeof import('@vetor-wallet/brapi-core')>(
    '@vetor-wallet/brapi-core'
  );
  return {
    ...actual,
    getMarketUniverse: () => universeImpl(),
    fetchDailyHistory: (t: string) => historyImpl(t),
  };
});

const q = (ticker: string, change: number, over: Record<string, unknown> = {}) => ({
  ticker,
  name: ticker,
  close: 10,
  change,
  volume: 1_000_000,
  marketCap: 1e9,
  sector: null,
  ...over,
});

describe('GET /api/market/today', () => {
  let app: Express;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: marketRouter } = await import('./market');
    const { errorHandler } = await import('../middleware/errorHandler');
    await initDb();
    app = express();
    app.use(express.json());
    app.use(session({ name: 'sid', secret: 's', resave: false, saveUninitialized: false }));
    app.use('/api/auth', authRouter);
    app.use('/api/market', marketRouter);
    app.use(errorHandler);
    agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'market@test.com', password: 'password123' });
  });

  it('exige autenticação (401)', async () => {
    const res = await request(app).get('/api/market/today');
    expect(res.status).toBe(401);
  });

  it('devolve altas, baixas e mais negociadas filtradas por liquidez, com o horário do dado', async () => {
    universeImpl = async () => ({
      quotes: [q('UP', 4), q('DN', -3), q('MICO', 90, { volume: 10 }), q('FLAT', 0)],
      fetchedAt: Date.UTC(2026, 10, 26, 15, 0, 0),
    });
    const res = await agent.get('/api/market/today');
    expect(res.status).toBe(200);
    expect(res.body.gainers.map((x: { ticker: string }) => x.ticker)).toEqual(['UP']);
    expect(res.body.losers.map((x: { ticker: string }) => x.ticker)).toEqual(['DN']);
    expect(res.body.mostTraded).toHaveLength(3);
    expect(res.body.asOf).toBe('2026-11-26T15:00:00.000Z');
    expect(res.body.minTradedValue).toBe(5_000_000);
  });

  it('responde 502 quando a brapi está fora e não há cache', async () => {
    universeImpl = async () => {
      throw new Error('brapi responded with 503');
    };
    const res = await agent.get('/api/market/today');
    expect(res.status).toBe(502);
    expect(res.body.error).toBeTruthy();
  });
});

describe('GET /api/market/history/:ticker', () => {
  let app: Express;
  let agent: ReturnType<typeof request.agent>;
  let BrapiStatusError: typeof import('@vetor-wallet/brapi-core').BrapiStatusError;

  beforeAll(async () => {
    ({ BrapiStatusError } = await import('@vetor-wallet/brapi-core'));
    const { default: authRouter } = await import('../auth/router');
    const { default: marketRouter } = await import('./market');
    const { errorHandler } = await import('../middleware/errorHandler');
    app = express();
    app.use(express.json());
    app.use(session({ name: 'sid', secret: 's', resave: false, saveUninitialized: false }));
    app.use('/api/auth', authRouter);
    app.use('/api/market', marketRouter);
    app.use(errorHandler);
    agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'market-history@test.com', password: 'password123' });
  });

  const sample = (ticker: string) => ({
    ticker,
    name: 'Empresa',
    price: 10,
    changePercent: 1,
    points: [
      { date: '2026-11-24', close: 9 },
      { date: '2026-11-25', close: 10 },
    ],
    fetchedAt: '2026-11-26T12:00:00.000Z',
  });

  it('exige autenticação (401)', async () => {
    const res = await request(app).get('/api/market/history/PETR4');
    expect(res.status).toBe(401);
  });

  it('devolve o histórico com cache privado e normaliza o ticker para maiúsculas', async () => {
    historyImpl = async (t) => {
      historyCalls.push(t);
      return sample(t);
    };
    const res = await agent.get('/api/market/history/petr4');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sample('PETR4'));
    expect(res.headers['cache-control']).toBe('private, max-age=3600');
    expect(historyCalls.at(-1)).toBe('PETR4');
  });

  it('aceita índice com ^ (Ibovespa)', async () => {
    const res = await agent.get(`/api/market/history/${encodeURIComponent('^BVSP')}`);
    expect(res.status).toBe(200);
    expect(historyCalls.at(-1)).toBe('^BVSP');
  });

  it('ticker malformado → 400 sem ir à brapi', async () => {
    const before = historyCalls.length;
    const res = await agent.get(`/api/market/history/${encodeURIComponent('PETR4,VALE3')}`);
    expect(res.status).toBe(400);
    expect(historyCalls.length).toBe(before);
  });

  it('brapi 404 → 404 (ativo sem histórico)', async () => {
    historyImpl = async (t) => {
      throw new BrapiStatusError(404, t);
    };
    const res = await agent.get('/api/market/history/XPTO3');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it('brapi fora → 502', async () => {
    historyImpl = async () => {
      throw new Error('network down');
    };
    const res = await agent.get('/api/market/history/VALE3');
    expect(res.status).toBe(502);
  });
});
