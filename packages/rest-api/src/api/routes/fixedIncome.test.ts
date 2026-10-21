import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import { installFakeCognito } from '../auth/__fixtures__/fakeCognito';

// Banco temporário por arquivo; DATABASE_URL ANTES do dynamic import do db
// (o client lê o env no top-level do módulo).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-fixed-income-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

installFakeCognito();

// Valores INVENTADOS — nenhum dado financeiro real entra em arquivo versionado.
const valid = {
  name: 'CDB Banco Exemplo',
  kind: 'CDB',
  institution: 'Banco Exemplo',
  investedAmount: 1000,
  investedAt: '2026-01-10',
  maturityDate: '2028-01-10',
  rateType: 'CDI',
  rate: 110,
};

describe('fixed-income routes (T-091c/d, fatia c1)', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: fixedIncomeRouter } = await import('./fixedIncome');
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
    app.use('/api/fixed-income', fixedIncomeRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);
    await agentA
      .post('/api/auth/register')
      .send({ email: 'fixed-income-a@test.com', password: 'password123' });
    await agentB
      .post('/api/auth/register')
      .send({ email: 'fixed-income-b@test.com', password: 'password123' });
  });

  async function createA(overrides: Record<string, unknown> = {}) {
    const res = await agentA.post('/api/fixed-income').send({ ...valid, ...overrides });
    expect(res.status).toBe(201);
    return res.body as { id: number } & Record<string, unknown>;
  }

  it('responde 401 sem sessão', async () => {
    expect((await request(app).get('/api/fixed-income')).status).toBe(401);
    expect((await request(app).post('/api/fixed-income').send(valid)).status).toBe(401);
  });

  it('GET de usuário sem posições devolve lista vazia e summary zerado', async () => {
    const res = await agentB.get('/api/fixed-income');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ positions: [], summary: { totalInvested: 0, totalCurrent: 0 } });
  });

  describe('POST', () => {
    it('cria a posição completa (201) e devolve a linha em snake_case', async () => {
      const body = await createA({ currentValue: 1050.25, currentValueDate: '2026-10-01' });
      expect(body).toMatchObject({
        name: 'CDB Banco Exemplo',
        kind: 'CDB',
        institution: 'Banco Exemplo',
        invested_amount: 1000,
        invested_at: '2026-01-10',
        maturity_date: '2028-01-10',
        rate_type: 'CDI',
        rate: 110,
        current_value: 1050.25,
        current_value_date: '2026-10-01',
      });
      expect(typeof body.id).toBe('number');
    });

    it('cria a posição mínima: institution vazio e opcionais nulos; rate 0 é válido', async () => {
      const body = await createA({
        name: '  Caixinha viagem  ',
        kind: 'CAIXINHA',
        institution: undefined,
        maturityDate: undefined,
        rate: 0,
      });
      expect(body).toMatchObject({
        name: 'Caixinha viagem',
        institution: '',
        maturity_date: null,
        current_value: null,
        current_value_date: null,
        rate: 0,
      });
    });

    it('maturityDate igual a investedAt é aceito', async () => {
      await createA({ maturityDate: valid.investedAt });
    });

    it.each([
      ['name', { name: undefined }],
      ['name vazio', { name: '   ' }],
      ['kind', { kind: undefined }],
      ['kind fora do vocabulário', { kind: 'POUPANCA' }],
      ['kind em minúsculas', { kind: 'cdb' }],
      ['institution não-texto', { institution: 42 }],
      ['investedAmount', { investedAmount: undefined }],
      ['investedAmount zero', { investedAmount: 0 }],
      ['investedAmount negativo', { investedAmount: -10 }],
      ['investedAmount texto', { investedAmount: '100' }],
      ['investedAmount com 3 casas', { investedAmount: 10.125 }],
      ['investedAt', { investedAt: undefined }],
      ['investedAt fora do formato', { investedAt: '10/01/2026' }],
      ['investedAt inexistente no calendário', { investedAt: '2026-02-30' }],
      ['maturityDate inválida', { maturityDate: '2028-13-01' }],
      ['maturityDate antes de investedAt', { maturityDate: '2026-01-09' }],
      ['rateType', { rateType: undefined }],
      ['rateType fora da lista', { rateType: 'IGPM' }],
      ['rate', { rate: undefined }],
      ['rate texto', { rate: '110' }],
      ['currentValue sem data', { currentValue: 10 }],
      ['currentValueDate sem valor', { currentValueDate: '2026-10-01' }],
      ['currentValue negativo', { currentValue: -1, currentValueDate: '2026-10-01' }],
      ['currentValue com 3 casas', { currentValue: 1.005, currentValueDate: '2026-10-01' }],
      ['currentValueDate inválida', { currentValue: 10, currentValueDate: '2026-02-30' }],
      ['currentValue null com data', { currentValue: null, currentValueDate: '2026-10-01' }],
    ])('recusa com 400: %s', async (_label, overrides) => {
      const res = await agentA.post('/api/fixed-income').send({ ...valid, ...overrides });
      expect(res.status).toBe(400);
      expect(typeof res.body.error).toBe('string');
    });

    it('recusa rate não-finito (1e999 no JSON vira Infinity) com 400', async () => {
      const res = await agentA
        .post('/api/fixed-income')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ ...valid, rate: 0 }).replace('"rate":0', '"rate":1e999'));
      expect(res.status).toBe(400);
    });

    it('currentValue 0 com data é saldo zero válido', async () => {
      const body = await createA({ currentValue: 0, currentValueDate: '2026-10-01' });
      expect(body.current_value).toBe(0);
    });
  });

  describe('GET', () => {
    it('lista só as posições do usuário e soma current_value ?? invested_amount', async () => {
      const agentC = request.agent(app);
      await agentC
        .post('/api/auth/register')
        .send({ email: 'fixed-income-c@test.com', password: 'password123' });
      await agentC
        .post('/api/fixed-income')
        .send({ ...valid, investedAmount: 100.1, investedAt: '2026-02-01' });
      await agentC.post('/api/fixed-income').send({
        ...valid,
        investedAmount: 200.2,
        investedAt: '2026-03-01',
        currentValue: 250.3,
        currentValueDate: '2026-10-01',
      });

      const res = await agentC.get('/api/fixed-income');
      expect(res.status).toBe(200);
      expect(res.body.positions).toHaveLength(2);
      // Aplicação mais recente primeiro.
      expect(res.body.positions[0].invested_at).toBe('2026-03-01');
      expect(res.body.summary).toEqual({ totalInvested: 300.3, totalCurrent: 350.4 });
    });
  });

  describe('PATCH', () => {
    it('edita só os campos enviados', async () => {
      const created = await createA();
      const res = await agentA
        .patch(`/api/fixed-income/${created.id}`)
        .send({ name: 'Renomeado', rate: 0 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        name: 'Renomeado',
        rate: 0,
        kind: 'CDB',
        invested_amount: 1000,
      });
    });

    it('corpo vazio (ou só com campos desconhecidos) → 400', async () => {
      const created = await createA();
      expect((await agentA.patch(`/api/fixed-income/${created.id}`).send({})).status).toBe(400);
      expect((await agentA.patch(`/api/fixed-income/${created.id}`).send({ foo: 1 })).status).toBe(
        400
      );
    });

    it('aplica a mesma validação da criação, campo a campo', async () => {
      const created = await createA();
      for (const body of [
        { kind: 'POUPANCA' },
        { investedAmount: 0 },
        { investedAmount: 1.234 },
        { investedAt: '2026-02-30' },
        { rateType: 'IGPM' },
        { rate: 'x' },
        { name: '' },
        { name: null },
        { investedAt: null },
        { currentValue: 10 },
        { currentValueDate: '2026-10-01' },
        { currentValue: -5, currentValueDate: '2026-10-01' },
      ]) {
        const res = await agentA.patch(`/api/fixed-income/${created.id}`).send(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
    });

    it('valida maturityDate contra o investedAt GRAVADO quando só um lado vem', async () => {
      const created = await createA({ investedAt: '2026-05-01', maturityDate: '2027-05-01' });
      const id = created.id;

      const antesDaAplicacao = await agentA
        .patch(`/api/fixed-income/${id}`)
        .send({ maturityDate: '2026-04-30' });
      expect(antesDaAplicacao.status).toBe(400);

      const aplicacaoDepoisDoVencimento = await agentA
        .patch(`/api/fixed-income/${id}`)
        .send({ investedAt: '2027-06-01' });
      expect(aplicacaoDepoisDoVencimento.status).toBe(400);

      const osDoisJuntos = await agentA
        .patch(`/api/fixed-income/${id}`)
        .send({ investedAt: '2027-06-01', maturityDate: '2029-06-01' });
      expect(osDoisJuntos.status).toBe(200);
    });

    it('null limpa o vencimento e o par saldo/data', async () => {
      const created = await createA({ currentValue: 1100, currentValueDate: '2026-10-01' });
      const res = await agentA
        .patch(`/api/fixed-income/${created.id}`)
        .send({ maturityDate: null, currentValue: null, currentValueDate: null });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        maturity_date: null,
        current_value: null,
        current_value_date: null,
      });
    });

    it('informa o saldo atual depois da criação', async () => {
      const created = await createA();
      const res = await agentA
        .patch(`/api/fixed-income/${created.id}`)
        .send({ currentValue: 1234.56, currentValueDate: '2026-10-15' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ current_value: 1234.56, current_value_date: '2026-10-15' });
    });

    it('id inexistente → 404', async () => {
      const res = await agentA.patch('/api/fixed-income/999999').send({ name: 'x' });
      expect(res.status).toBe(404);
    });
  });

  describe('vínculo com a Pluggy (T-091d, fatia d3a)', () => {
    it('posição nova nasce sem vínculo, e o POST ignora o campo', async () => {
      const created = await createA({ supersededByPluggyInvestmentId: 'abc-123' });
      expect(created.superseded_by_pluggy_investment_id).toBeNull();

      const list = await agentA.get('/api/fixed-income');
      const row = list.body.positions.find((p: { id: number }) => p.id === created.id);
      expect(row).toHaveProperty('superseded_by_pluggy_investment_id', null);
    });

    it('string seta, ausente preserva, null limpa — o campo sozinho é PATCH válido', async () => {
      const created = await createA({ name: 'Para vincular' });
      const url = `/api/fixed-income/${created.id}`;

      const set = await agentA.patch(url).send({ supersededByPluggyInvestmentId: 'abc-123' });
      expect(set.status).toBe(200);
      expect(set.body.superseded_by_pluggy_investment_id).toBe('abc-123');

      // PATCH de outro campo não mexe no vínculo.
      const other = await agentA.patch(url).send({ rate: 99 });
      expect(other.status).toBe(200);
      expect(other.body).toMatchObject({ rate: 99, superseded_by_pluggy_investment_id: 'abc-123' });

      const list = await agentA.get('/api/fixed-income');
      const row = list.body.positions.find((p: { id: number }) => p.id === created.id);
      expect(row.superseded_by_pluggy_investment_id).toBe('abc-123');

      const cleared = await agentA.patch(url).send({ supersededByPluggyInvestmentId: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.superseded_by_pluggy_investment_id).toBeNull();
    });

    it('aceita o limite de 128 caracteres e o alfabeto [A-Za-z0-9_-]', async () => {
      const created = await createA({ name: 'Id no limite' });
      const id = `${'a'.repeat(60)}_${'Z9'.repeat(33)}-`;
      expect(id).toHaveLength(128);
      const res = await agentA
        .patch(`/api/fixed-income/${created.id}`)
        .send({ supersededByPluggyInvestmentId: id });
      expect(res.status).toBe(200);
      expect(res.body.superseded_by_pluggy_investment_id).toBe(id);
    });

    it.each([
      ['string vazia', ''],
      ['número', 123],
      ['booleano', true],
      ['objeto', { id: 'abc' }],
      ['129 caracteres', 'a'.repeat(129)],
      ['200 caracteres', 'a'.repeat(200)],
      ['caractere especial', 'abc/123'],
      ['espaço', 'abc 123'],
      ['acento', 'investimentoé'],
    ])('valor inválido (%s) → 400, e o vínculo existente fica intocado', async (_label, value) => {
      const created = await createA({ name: 'Vínculo intocado' });
      const url = `/api/fixed-income/${created.id}`;
      await agentA.patch(url).send({ supersededByPluggyInvestmentId: 'abc-123' });

      const res = await agentA.patch(url).send({ supersededByPluggyInvestmentId: value });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('supersededByPluggyInvestmentId');

      const list = await agentA.get('/api/fixed-income');
      const row = list.body.positions.find((p: { id: number }) => p.id === created.id);
      expect(row.superseded_by_pluggy_investment_id).toBe('abc-123');
    });

    it('posição de outro usuário → 404, e o vínculo de A fica intocado', async () => {
      const created = await createA({ name: 'Vínculo de A' });
      const url = `/api/fixed-income/${created.id}`;
      await agentA.patch(url).send({ supersededByPluggyInvestmentId: 'abc-123' });

      expect((await agentB.patch(url).send({ supersededByPluggyInvestmentId: 'xyz' })).status).toBe(
        404
      );
      expect((await agentB.patch(url).send({ supersededByPluggyInvestmentId: null })).status).toBe(
        404
      );

      const list = await agentA.get('/api/fixed-income');
      const row = list.body.positions.find((p: { id: number }) => p.id === created.id);
      expect(row.superseded_by_pluggy_investment_id).toBe('abc-123');
    });
  });

  describe('DELETE', () => {
    it('apaga (204) e some da listagem', async () => {
      const created = await createA({ name: 'Para apagar' });
      expect((await agentA.delete(`/api/fixed-income/${created.id}`)).status).toBe(204);
      const list = await agentA.get('/api/fixed-income');
      expect(list.body.positions.some((p: { id: number }) => p.id === created.id)).toBe(false);
      expect((await agentA.delete(`/api/fixed-income/${created.id}`)).status).toBe(404);
    });
  });

  describe('isolamento por usuário', () => {
    it('B não lê, não edita e não apaga a posição de A (404), e a de A fica intocada', async () => {
      const created = await createA({ name: 'Só de A' });

      const listB = await agentB.get('/api/fixed-income');
      expect(listB.body.positions.some((p: { id: number }) => p.id === created.id)).toBe(false);

      const patchB = await agentB
        .patch(`/api/fixed-income/${created.id}`)
        .send({ name: 'invadido' });
      expect(patchB.status).toBe(404);

      const deleteB = await agentB.delete(`/api/fixed-income/${created.id}`);
      expect(deleteB.status).toBe(404);

      const listA = await agentA.get('/api/fixed-income');
      const mine = listA.body.positions.find((p: { id: number }) => p.id === created.id);
      expect(mine).toMatchObject({ name: 'Só de A' });
    });
  });
});
