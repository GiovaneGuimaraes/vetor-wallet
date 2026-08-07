import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import type { OfxImportResult } from '@vetor-wallet/shared';

// Banco temporário próprio deste arquivo; DATABASE_URL setado ANTES do dynamic
// import de '../../db' (o client lê o env no top-level do módulo).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-import-ofx-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

const OFX_ROUTE = '/api/import/ofx';

describe('POST /api/import/ofx (T-085)', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let db: Awaited<typeof import('@vetor-wallet/db')>['db'];
  let sgml: string;
  let xml: string;
  let sgmlLatin1: Buffer;

  function postOfx(agent: ReturnType<typeof request.agent>, body: string | Buffer) {
    return agent.post(OFX_ROUTE).set('Content-Type', 'text/plain').send(body as string);
  }

  /**
   * O fixture SGML declara `CHARSET:1252` no header, então ele TEM que viajar
   * como bytes cp1252/latin1 — mandar a string JS (que o supertest serializa em
   * UTF-8) com esse header é um arquivo contraditório, e o parser obedece ao
   * header. É o header que decide; o teste do `CHARSET:NONE` fixa o outro lado.
   */
  function postSgml(agent: ReturnType<typeof request.agent>, content = sgml) {
    return postOfx(agent, Buffer.from(content, 'latin1'));
  }

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: importOfxRouter } = await import('./importOfx');
    const { errorHandler } = await import('../middleware/errorHandler');
    const fixtures = await import('@vetor-wallet/bank-import-core/fixtures');

    db = dbModule.db;
    sgml = fixtures.OFX_SGML_ITAU;
    xml = fixtures.OFX_XML_NUBANK;
    sgmlLatin1 = fixtures.ofxSgmlLatin1Buffer();

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
      }),
    );
    app.use('/api/auth', authRouter);
    app.use(OFX_ROUTE, importOfxRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);
    await agentA
      .post('/api/auth/register')
      .send({ email: 'import-ofx-a@test.com', password: 'password123' });
    await agentB
      .post('/api/auth/register')
      .send({ email: 'import-ofx-b@test.com', password: 'password123' });
  });

  afterEach(async () => {
    await db.execute('DELETE FROM expense_entries');
    await db.execute('DELETE FROM income_entries');
  });

  it('returns 401 without session', async () => {
    const res = await request(app).post(OFX_ROUTE).set('Content-Type', 'text/plain').send(sgml);
    expect(res.status).toBe(401);
  });

  it('importa o extrato SGML: crédito → renda, débitos → despesa', async () => {
    const res = await postSgml(agentA);
    expect(res.status).toBe(200);
    const body = res.body as OfxImportResult;
    expect(body).toMatchObject({ imported: 3, duplicated: 0, rejected: 0 });
    expect(body.transactions.map((t) => [t.fitid, t.status, t.entryType, t.amount])).toEqual([
      ['ITAU00001', 'imported', 'expense', 152.9],
      ['ITAU00002', 'imported', 'income', 4800],
      ['ITAU00003', 'imported', 'expense', 39.9],
    ]);

    const expenses = await db.execute('SELECT description, category, amount, date, external_id FROM expense_entries ORDER BY id');
    expect(expenses.rows).toHaveLength(2);
    expect(expenses.rows[0].external_id).toBe('ofx:ITAU00001');
    expect(expenses.rows[0].amount).toBe(152.9);
    expect(expenses.rows[0].date).toBe('2026-07-03');
    // Categoria derivada do MEMO pela normalização da T-028.
    expect(expenses.rows[0].category).toBe('supermercado açaí ltda');

    const income = await db.execute('SELECT amount, external_id FROM income_entries');
    expect(income.rows).toHaveLength(1);
    expect(income.rows[0].external_id).toBe('ofx:ITAU00002');
    expect(income.rows[0].amount).toBe(4800);
  });

  it('preserva acentuação de arquivo cp1252 (header CHARSET:1252 + bytes latin1)', async () => {
    const res = await postOfx(agentA, sgmlLatin1);
    expect(res.status).toBe(200);
    const rows = await db.execute("SELECT description FROM expense_entries WHERE external_id = 'ofx:ITAU00001'");
    expect(rows.rows[0].description).toBe('SUPERMERCADO AÇAÍ LTDA');
  });

  it('preserva acentuação de arquivo UTF-8 (header sem CHARSET:1252)', async () => {
    const utf8Sgml = sgml
      .replace('CHARSET:1252', 'CHARSET:NONE')
      .replace('ENCODING:USASCII', 'ENCODING:UTF-8');
    const res = await postOfx(agentA, Buffer.from(utf8Sgml, 'utf8'));
    expect(res.status).toBe(200);
    const rows = await db.execute(
      "SELECT description, category FROM expense_entries WHERE external_id = 'ofx:ITAU00001'",
    );
    expect(rows.rows[0].description).toBe('SUPERMERCADO AÇAÍ LTDA');
    expect(rows.rows[0].category).toBe('supermercado açaí ltda');
  });

  it('reimportar o MESMO extrato não duplica nada (dedupe por external_id da T-084)', async () => {
    await postSgml(agentA);
    const res = await postSgml(agentA);
    expect(res.status).toBe(200);
    const body = res.body as OfxImportResult;
    expect(body).toMatchObject({ imported: 0, duplicated: 3, rejected: 0 });
    expect(body.transactions.every((t) => t.status === 'duplicated')).toBe(true);
    // O relatório de duplicata traz o id da linha JÁ existente.
    expect(body.transactions[0].entryId).toBeTypeOf('number');

    const expenses = await db.execute('SELECT id FROM expense_entries');
    const income = await db.execute('SELECT id FROM income_entries');
    expect(expenses.rows).toHaveLength(2);
    expect(income.rows).toHaveLength(1);
  });

  it('FITID repetido DENTRO do mesmo arquivo cai como duplicata, não como erro', async () => {
    const doubled = sgml.replace('</BANKTRANLIST>', `<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260703120000[-3:BRT]
<TRNAMT>-152,90
<FITID>ITAU00001
<MEMO>SUPERMERCADO AÇAÍ LTDA
</STMTTRN>
</BANKTRANLIST>`);
    const res = await postSgml(agentA, doubled);
    expect(res.body).toMatchObject({ imported: 3, duplicated: 1, rejected: 0 });
    const expenses = await db.execute('SELECT id FROM expense_entries');
    expect(expenses.rows).toHaveLength(2);
  });

  it('relata rejeição por transação (sem FITID, data impossível) e importa o resto', async () => {
    const res = await postOfx(agentA, xml);
    expect(res.status).toBe(200);
    const body = res.body as OfxImportResult;
    expect(body).toMatchObject({ imported: 2, duplicated: 0, rejected: 2 });

    const rejected = body.transactions.filter((t) => t.status === 'rejected');
    expect(rejected[0].reason).toBe('FITID ausente');
    expect(rejected[0].fitid).toBeUndefined();
    // Campos legíveis da linha rejeitada ficam no relatório como contexto.
    expect(rejected[0].description).toBe('Transacao sem FITID');
    expect(rejected[0].amount).toBe(10);
    expect(rejected[1].reason).toBe('DTPOSTED inválida ou ausente');
    expect(rejected[1].fitid).toBe('NU-DATA-IMPOSSIVEL');
    expect(rejected[1].date).toBeUndefined();

    // Nenhuma rejeitada foi gravada.
    const expenses = await db.execute('SELECT external_id FROM expense_entries');
    expect(expenses.rows.map((r) => r.external_id)).toEqual(['ofx:NU-2026-07-12-002']);
    // Entidade XML decodificada na descrição da renda.
    const income = await db.execute('SELECT description FROM income_entries');
    expect(income.rows[0].description).toBe('Freela Design & Cia');
  });

  it('OFX válido sem transações responde 200 com relatório vazio', async () => {
    const res = await postOfx(agentA, '<OFX>\n<BANKMSGSRSV1>\n</BANKMSGSRSV1>\n</OFX>');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ imported: 0, duplicated: 0, rejected: 0, transactions: [] });
  });

  it('corpo vazio responde 400', async () => {
    const res = await agentA.post(OFX_ROUTE).set('Content-Type', 'text/plain').send('   ');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Body vazio');
  });

  it('arquivo que não é OFX responde 400 (documento inteiro, não linha)', async () => {
    const res = await postOfx(agentA, 'ticker,type,quantity,price,date\nPETR4,BUY,10,30,2026-07-01');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/OFX/);
    const expenses = await db.execute('SELECT id FROM expense_entries');
    expect(expenses.rows).toHaveLength(0);
  });

  it('isola usuários: o mesmo FITID importa para os dois e cada um vê só o seu', async () => {
    const resA = await postSgml(agentA);
    const resB = await postSgml(agentB);
    expect(resA.body).toMatchObject({ imported: 3, duplicated: 0 });
    expect(resB.body).toMatchObject({ imported: 3, duplicated: 0 });

    const rows = await db.execute(
      "SELECT user_id, COUNT(*) AS n FROM expense_entries WHERE external_id = 'ofx:ITAU00001' GROUP BY user_id",
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every((r) => Number(r.n) === 1)).toBe(true);
  });

  describe('gate de assinatura (T-071)', () => {
    it('responde 402 com BILLING_ENABLED e sem assinatura ativa', async () => {
      process.env.BILLING_ENABLED = 'true';
      try {
        const res = await postSgml(agentA);
        expect(res.status).toBe(402);
        expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
        const expenses = await db.execute('SELECT id FROM expense_entries');
        expect(expenses.rows).toHaveLength(0);
      } finally {
        delete process.env.BILLING_ENABLED;
      }
    });
  });
});
