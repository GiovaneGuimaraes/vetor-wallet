import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

// Banco temporário próprio deste arquivo — DATABASE_URL precisa estar setada
// antes do import dinâmico de '../../db' (ver comentário em operations.test.ts).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-portfolio-history-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

interface HistoryPoint {
  date: string;
  value: number;
  invested: number;
}

describe('GET /api/portfolio/history (T-058a)', () => {
  let app: Express;
  let db: typeof import('@vetor-wallet/db').db;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let today: string;
  let d: (delta: number) => string;

  async function saveSnapshotAt(ticker: string, isoDate: string, price: number) {
    await db.execute({
      sql: 'INSERT INTO quote_snapshots (ticker, price, captured_at) VALUES (?, ?, ?)',
      args: [ticker, price, `${isoDate}T18:00:00`],
    });
  }

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    const { initDb } = dbModule;
    db = dbModule.db;
    const { default: authRouter } = await import('../auth/router');
    const { default: operationsRouter } = await import('./operations');
    const { default: portfolioRouter } = await import('./portfolio');
    const { errorHandler } = await import('../middleware/errorHandler');
    const { getBRTDate } = await import('@vetor-wallet/portfolio-core');
    const { shiftDate } = await import('@vetor-wallet/portfolio-core');

    await initDb();

    // Mesma âncora de "hoje" da rota (data BRT), sempre relativa — nada fixo.
    today = getBRTDate().toISOString().split('T')[0];
    d = (delta: number) => shiftDate(today, delta);

    app = express();
    app.use(express.json());
    app.use(
      session({
        name: 'sid',
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
      }),
    );
    app.use('/api/auth', authRouter);
    app.use('/api/operations', operationsRouter);
    app.use('/api/portfolio', portfolioRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    await agentA
      .post('/api/auth/register')
      .send({ email: 'history-a@test.com', password: 'password123' });
    agentB = request.agent(app);
    await agentB
      .post('/api/auth/register')
      .send({ email: 'history-b@test.com', password: 'password123' });

    // A: 10 PETR4 a 10 (custo 100), comprados há 3 dias.
    await agentA
      .post('/api/operations')
      .send({ ticker: 'PETR4', type: 'BUY', quantity: 10, price: 10, date: d(-3) });
    // B: 100 VALE3 a 50 (custo 5000) — ordem de grandeza bem diferente da de A,
    // para que qualquer vazamento entre usuários apareça no valor.
    await agentB
      .post('/api/operations')
      .send({ ticker: 'VALE3', type: 'BUY', quantity: 100, price: 50, date: d(-3) });

    // Fechamentos: PETR4 tem buraco em d(-2) (forward-fill); VALE3 é constante.
    await saveSnapshotAt('PETR4', d(-3), 10);
    await saveSnapshotAt('PETR4', d(-1), 12);
    await saveSnapshotAt('VALE3', d(-3), 50);
  });

  it('requires authentication (401)', async () => {
    const res = await request(app).get('/api/portfolio/history');
    expect(res.status).toBe(401);
  });

  it('returns the daily series forward-filling the missing day', async () => {
    const res = await agentA.get('/api/portfolio/history?days=4');
    expect(res.status).toBe(200);

    const points = res.body.points as HistoryPoint[];
    expect(points.map((p) => p.date)).toEqual([d(-3), d(-2), d(-1), today]);
    expect(points).toEqual([
      { date: d(-3), value: 100, invested: 100 },
      { date: d(-2), value: 100, invested: 100 }, // sem snapshot: herda o de d(-3)
      { date: d(-1), value: 120, invested: 100 },
      { date: today, value: 120, invested: 100 }, // sem snapshot de hoje ainda
    ]);
  });

  it('isolates users — the operations of B never enter the series of A', async () => {
    const resA = await agentA.get('/api/portfolio/history?days=4');
    const resB = await agentB.get('/api/portfolio/history?days=4');

    const pointsA = resA.body.points as HistoryPoint[];
    const pointsB = resB.body.points as HistoryPoint[];

    // A nunca vê os 5000 de B
    for (const p of pointsA) {
      expect(p.value).toBeLessThan(1000);
      expect(p.invested).toBe(100);
    }
    // e B vê só a própria posição (VALE3 constante a 50)
    expect(pointsB).toEqual([
      { date: d(-3), value: 5000, invested: 5000 },
      { date: d(-2), value: 5000, invested: 5000 },
      { date: d(-1), value: 5000, invested: 5000 },
      { date: today, value: 5000, invested: 5000 },
    ]);
  });

  it('omits the days before the first operation of the user', async () => {
    const res = await agentA.get('/api/portfolio/history?days=30');
    expect(res.status).toBe(200);
    const points = res.body.points as HistoryPoint[];
    expect(points.length).toBe(4);
    expect(points[0].date).toBe(d(-3));
  });

  it('reflects a SELL from the day it happened', async () => {
    const sell = await agentA
      .post('/api/operations')
      .send({ ticker: 'PETR4', type: 'SELL', quantity: 4, price: 12, date: d(-1) });
    expect(sell.status).toBe(201);

    const res = await agentA.get('/api/portfolio/history?days=4');
    const points = res.body.points as HistoryPoint[];
    expect(points).toEqual([
      { date: d(-3), value: 100, invested: 100 },
      { date: d(-2), value: 100, invested: 100 },
      { date: d(-1), value: 72, invested: 60 }, // 6 × 12 de valor, 6 × 10 de custo
      { date: today, value: 72, invested: 60 },
    ]);

    // desfaz para não vazar estado para os testes seguintes
    await agentA.delete(`/api/operations/${sell.body.id}`);
  });

  it('days = 1 returns a single point for today', async () => {
    const res = await agentA.get('/api/portfolio/history?days=1');
    expect(res.status).toBe(200);
    const points = res.body.points as HistoryPoint[];
    expect(points.length).toBe(1);
    expect(points[0].date).toBe(today);
  });

  it('defaults to 90 days when ?days= is absent', async () => {
    const res = await agentA.get('/api/portfolio/history');
    expect(res.status).toBe(200);
    // a carteira só existe há 3 dias, então a janela maior não muda os pontos
    expect((res.body.points as HistoryPoint[]).length).toBe(4);
  });

  it('returns an empty series for a user with no operations', async () => {
    const agentC = request.agent(app);
    await agentC
      .post('/api/auth/register')
      .send({ email: 'history-c@test.com', password: 'password123' });

    const res = await agentC.get('/api/portfolio/history?days=10');
    expect(res.status).toBe(200);
    expect(res.body.points).toEqual([]);
  });

  it.each(['0', '366', 'abc', '1.5', '-1', ''])('rejects days=%s with 400', async (days) => {
    const res = await agentA.get(`/api/portfolio/history?days=${days}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/days/);
  });

  // Seed do forward-fill: um ticker recém-comprado, ainda sem nenhuma coleta,
  // não pode truncar a série (com a coleta só-no-boot isso levaria dias).
  it('includes a ticker bought with no snapshot at all, priced at the buy price', async () => {
    const agentD = request.agent(app);
    await agentD
      .post('/api/auth/register')
      .send({ email: 'history-d@test.com', password: 'password123' });
    await agentD
      .post('/api/operations')
      .send({ ticker: 'BBAS3', type: 'BUY', quantity: 5, price: 20, date: d(-1) });

    const res = await agentD.get('/api/portfolio/history?days=3');
    expect(res.status).toBe(200);
    expect(res.body.points as HistoryPoint[]).toEqual([
      { date: d(-1), value: 100, invested: 100 },
      { date: today, value: 100, invested: 100 },
    ]);
  });

  it('accepts the upper bound days=365', async () => {
    const res = await agentA.get('/api/portfolio/history?days=365');
    expect(res.status).toBe(200);
  });

  // T-063: a query de snapshots ganhou piso de data (só a janela + a linha de
  // base por ticker); um fechamento bem anterior ao início da janela precisa
  // continuar servindo de base do forward-fill do primeiro dia dela.
  it('uses a snapshot older than the requested window as the forward-fill base of its first day', async () => {
    const agentE = request.agent(app);
    await agentE
      .post('/api/auth/register')
      .send({ email: 'history-e@test.com', password: 'password123' });

    // compra antiga, bem fora da janela de 3 dias pedida abaixo
    await agentE
      .post('/api/operations')
      .send({ ticker: 'ITSA4', type: 'BUY', quantity: 10, price: 5, date: d(-30) });
    // único fechamento conhecido: também fora da janela (mas depois da compra)
    await saveSnapshotAt('ITSA4', d(-20), 8);

    const res = await agentE.get('/api/portfolio/history?days=3');
    expect(res.status).toBe(200);
    expect(res.body.points as HistoryPoint[]).toEqual([
      { date: d(-2), value: 80, invested: 50 },
      { date: d(-1), value: 80, invested: 50 },
      { date: today, value: 80, invested: 50 },
    ]);
  });
});
