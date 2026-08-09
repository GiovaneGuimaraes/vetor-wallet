import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

// Unique on-disk temp DB per test file. Static `import` declarations are
// hoisted above other statements, so setting DATABASE_URL before a static
// `import '../../db'` would NOT take effect in time — '../../db' captures the URL
// at module-eval time. Route/db modules are therefore imported dynamically
// inside beforeAll, after the env var is set.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-import-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('import routes — CSV SELL validation', () => {
  let app: Express;
  let db: typeof import('@vetor-wallet/db').db;
  let agentA: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    const { initDb } = dbModule;
    db = dbModule.db;
    const { default: authRouter } = await import('../auth/router');
    const { default: importRouter } = await import('./import');
    const { default: walletsRouter } = await import('./wallets');
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
    app.use('/api/import', importRouter);
    app.use('/api/wallets', walletsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    await agentA
      .post('/api/auth/register')
      .send({ email: 'import-a@test.com', password: 'password123' });
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

  // T-050 inverteu esta asserção (era T-019, "rejects a SELL that exceeds the position
  // of the target wallet"): com carteira única o escopo é o USUÁRIO, então um SELL
  // coberto pela soma das carteiras legadas é ACEITO e `?walletId=` não muda nada.
  it('accepts a SELL covered by the sum across legacy wallets, ignoring ?walletId=', async () => {
    // duas carteiras legadas criadas direto no banco (a rota não cria mais a 2ª)
    const userRow = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: ['import-a@test.com'],
    });
    const userAId = Number(userRow.rows[0].id);

    const legacyA = await db.execute({
      sql: 'INSERT INTO wallets (user_id, name) VALUES (?, ?)',
      args: [userAId, 'Carteira legada A'],
    });
    const legacyB = await db.execute({
      sql: 'INSERT INTO wallets (user_id, name) VALUES (?, ?)',
      args: [userAId, 'Carteira legada B'],
    });
    const walletAId = Number(legacyA.lastInsertRowid);
    const walletBId = Number(legacyB.lastInsertRowid);

    // 50 ITSA4 em cada carteira legada → consolidado de 100
    for (const wid of [walletAId, walletBId]) {
      await db.execute({
        sql: 'INSERT INTO operations (ticker, type, quantity, price, date, user_id, wallet_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: ['ITSA4', 'BUY', 50, 10, '2024-02-01', userAId, wid],
      });
    }

    // SELL de 100 é coberto pelo consolidado do usuário — aceito, e o walletId da
    // query string não altera o resultado.
    const sell = await agentA
      .post(`/api/import?walletId=${walletAId}`)
      .type('text/csv')
      .send('ticker,type,quantity,price,date\nITSA4,SELL,100,12,2024-02-02');
    expect(sell.status).toBe(200);
    expect(sell.body.imported).toBe(1);
    expect(sell.body.errors).toHaveLength(0);

    // posição agora é zero — qualquer novo SELL é rejeitado, com ou sem walletId
    const over = await agentA
      .post(`/api/import?walletId=${walletBId}`)
      .type('text/csv')
      .send('ticker,type,quantity,price,date\nITSA4,SELL,1,12,2024-02-03');
    expect(over.body.imported).toBe(0);
    expect(over.body.errors).toHaveLength(1);
    expect(over.body.errors[0].error).toMatch(/posicao/i);
  });

  it('rejects a row with a non-finite numeric value (1e999 parses to Infinity) while importing the other valid rows', async () => {
    const csv = [
      'ticker,type,quantity,price,date',
      'BBAS3,BUY,10,20,2024-03-01', // valid
      'BBAS3,BUY,1e999,20,2024-03-02', // quantity overflows to Infinity — rejected
      'BBAS3,BUY,10,1e999,2024-03-03', // price overflows to Infinity — rejected
      'BBAS3,BUY,5,25,2024-03-04', // valid
    ].join('\n');

    const res = await agentA.post('/api/import').type('text/csv').send(csv);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.errors[0]).toMatchObject({ line: 3 });
    expect(res.body.errors[0].error).toMatch(/quantidade inválida/);
    expect(res.body.errors[1]).toMatchObject({ line: 4 });
    expect(res.body.errors[1].error).toMatch(/preço inválido/);
  });

  // T-059: mesmo padrão da T-052 (isValidMoneyAmount), agora também no CSV.
  it('rejects a row with price with more than 2 decimal places, importing the other valid rows', async () => {
    const csv = [
      'ticker,type,quantity,price,date',
      'BBAS3,BUY,10,20,2026-04-01', // valid
      'BBAS3,BUY,5,20.125,2026-04-02', // 3 decimal places — rejected
    ].join('\n');

    const res = await agentA.post('/api/import').type('text/csv').send(csv);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toMatchObject({ line: 3 });
    expect(res.body.errors[0].error).toMatch(/2 casas decimais/);
    // T-065: rótulo deve identificar o campo em pt-BR ('preço'), não o
    // genérico/em inglês 'price' que a mensagem usava antes.
    expect(res.body.errors[0].error).toMatch(/^preço /);
    expect(res.body.errors[0].error).not.toMatch(/^price /);
  });

  // T-043: uma data com formato válido mas inexistente no calendário é
  // rejeitada linha a linha, igual às demais validações de linha.
  it('rejects a row with a nonexistent calendar date (2026-02-30) while importing the other valid rows', async () => {
    const csv = [
      'ticker,type,quantity,price,date',
      'BBAS3,BUY,10,20,2026-02-30', // day does not exist in February
      'BBAS3,BUY,5,25,2026-03-01', // valid
    ].join('\n');

    const res = await agentA.post('/api/import').type('text/csv').send(csv);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toMatchObject({ line: 2 });
    expect(res.body.errors[0].error).toMatch(/data inválida/);
  });
});
