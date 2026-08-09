import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

// Banco temporário próprio deste arquivo — DATABASE_URL antes do import
// dinâmico de '../../db' (mesmo padrão dos outros testes de rota).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-benchmarks-history-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

interface SeriesPoint {
  date: string;
  value: number;
}

describe('GET /api/benchmarks/history (T-068)', () => {
  let app: Express;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: benchmarksRouter } = await import('./benchmarks');
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
    app.use('/api/benchmarks', benchmarksRouter);
    app.use(errorHandler);

    agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'bench-history@test.com', password: 'password123' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exige sessão', async () => {
    const res = await request(app).get('/api/benchmarks/history');
    expect(res.status).toBe(401);
  });

  it('rejeita days inválido ou fora da faixa', async () => {
    for (const days of ['0', '366', '-1', '1.5', 'abc']) {
      const res = await agent.get(`/api/benchmarks/history?days=${days}`);
      expect(res.status, `days=${days}`).toBe(400);
      expect(res.body.error).toContain('days');
    }
  });

  it('devolve as duas séries e o período da janela pedida', async () => {
    const bcbRows = [
      { data: '02/01/2026', valor: '0,050000' },
      { data: '05/01/2026', valor: '0,050000' },
    ];

    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = String(input);
      if (url.includes('bcb.gov.br')) {
        return new Response(JSON.stringify(bcbRows), { status: 200 });
      }
      // Data BRT de hoje (mesma âncora da rota, padrão hourlyInsights.ts) — meio-dia
      // UTC dessa data garante que buildIbovespaSeries (que data em UTC) produza um
      // ponto dentro da janela [from, to] em qualquer horário de execução.
      const brtDate = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const year = brtDate.getUTCFullYear();
      const month = String(brtDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(brtDate.getUTCDate()).padStart(2, '0');
      const isoDate = `${year}-${month}-${day}`;
      const noonDate = new Date(`${isoDate}T12:00:00Z`);
      const todayTs = Math.floor(noonDate.getTime() / 1000);
      const response = {
        results: [
          {
            historicalDataPrice: [{ date: todayTs, close: 130000 }],
          },
        ],
      };
      return new Response(JSON.stringify(response), { status: 200 });
    });

    const res = await agent.get('/api/benchmarks/history?days=30');
    expect(res.status).toBe(200);
    expect(res.body.period.from < res.body.period.to).toBe(true);

    const cdi = res.body.cdi as SeriesPoint[];
    expect(cdi).toHaveLength(2);
    expect(cdi[0]).toEqual({ date: '2026-01-02', value: expect.closeTo(100.05, 6) });

    const ibov = res.body.ibovespa as SeriesPoint[];
    expect(ibov).toHaveLength(1);
    expect(ibov[0].value).toBe(130000);
  });

  it('fonte externa indisponível vira null naquela série, sem derrubar a rota', async () => {
    vi.stubGlobal('fetch', async (input: string | URL) => {
      if (String(input).includes('bcb.gov.br')) {
        throw new Error('timeout');
      }
      return new Response('boom', { status: 500 });
    });

    const res = await agent.get('/api/benchmarks/history');
    expect(res.status).toBe(200);
    expect(res.body.cdi).toBeNull();
    expect(res.body.ibovespa).toBeNull();
  });
});
