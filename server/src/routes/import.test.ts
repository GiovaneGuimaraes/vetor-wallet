import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

// Unique on-disk temp DB per test file. Static `import` declarations are
// hoisted above other statements, so setting DATABASE_URL before a static
// `import '../db'` would NOT take effect in time — '../db' captures the URL
// at module-eval time. Route/db modules are therefore imported dynamically
// inside beforeAll, after the env var is set.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-import-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('import routes — CSV SELL validation', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('../db');
    const { default: authRouter } = await import('../auth/router');
    const { default: importRouter } = await import('./import');
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
      }),
    );
    app.use('/api/auth', authRouter);
    app.use('/api/import', importRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    await agentA.post('/api/auth/register').send({ email: 'import-a@test.com', password: 'password123' });
  });

  it('rejects only the offending SELL row when it exceeds the position built from prior valid rows in the same file, importing the rest', async () => {
    const csv = [
      'ticker,type,quantity,price,date',
      'PETR4,BUY,100,30,2024-01-01',
      'PETR4,SELL,200,40,2024-01-02', // exceeds the 100 just bought above — rejected
      'VALE3,BUY,10,80,2024-01-03', // unrelated, valid row still imported
    ].join('\n');

    const res = await agentA.post('/api/import').type('text/csv').send(csv);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toMatchObject({ line: 3 });
    expect(res.body.errors[0].error).toMatch(/posicao/i);
    // PETR4 position after this import is 100 (only the BUY landed, the SELL was rejected) —
    // exercised by the next two tests via further imports of that same ticker.
  });

  it('rejects a SELL that exceeds the position already persisted from a previous import', async () => {
    const res = await agentA
      .post('/api/import')
      .type('text/csv')
      .send('ticker,type,quantity,price,date\nPETR4,SELL,101,40,2024-01-04');
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(0);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].error).toMatch(/posicao/i);
  });

  it('accepts a SELL exactly equal to the persisted position', async () => {
    const res = await agentA
      .post('/api/import')
      .type('text/csv')
      .send('ticker,type,quantity,price,date\nPETR4,SELL,100,45,2024-01-05');
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(0);
  });
});
