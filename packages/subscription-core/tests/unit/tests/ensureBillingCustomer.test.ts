import type { QueryConfig } from '@vetor-wallet/query';

import { ensureBillingCustomer } from 'src/ensureBillingCustomer';
import { createFakeBillingDb, type FakeBillingDb } from 'tests/unit/fakeBillingDb';
import { calledPaths, errorEnvelope, mockFetch, okEnvelope, routeFetch } from 'tests/unit/mockFetch';

const USER = 7;

const ensure = (db: FakeBillingDb) => {
  return ensureBillingCustomer({ query: db.query, userId: USER, email: 'ana@example.com', name: 'Ana' });
};

describe('ensureBillingCustomer', () => {
  let fetchMock: jest.Mock;
  let seq: number;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    seq = 0;
    routeFetch(fetchMock, (path) => {
      if (path === '/customers/create') {
        seq += 1;
        return okEnvelope({ id: `cust_${seq}` });
      }
      return undefined;
    });
  });

  test('já existe: devolve sem chamar o provedor', async () => {
    const db = createFakeBillingDb({ customers: [{ user_id: USER, abacate_customer_id: 'cust_old' }] });

    expect(await ensure(db)).toEqual({ customerId: 'cust_old', created: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('não existe: cria só com e-mail e nome, e grava o vínculo', async () => {
    const db = createFakeBillingDb();

    expect(await ensure(db)).toEqual({ customerId: 'cust_1', created: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'ana@example.com', name: 'Ana' });
    expect(db.state.customers).toEqual([{ user_id: USER, abacate_customer_id: 'cust_1' }]);
  });

  test('segunda chamada reaproveita (a AbacatePay só deduplica por CPF, que não mandamos)', async () => {
    const db = createFakeBillingDb();
    await ensure(db);

    expect(await ensure(db)).toEqual({ customerId: 'cust_1', created: false });
    expect(calledPaths(fetchMock)).toEqual(['/customers/create']);
  });

  test('CORRIDA: dois ao mesmo tempo → um vínculo só; o perdedor usa o do vencedor e reporta o órfão', async () => {
    const db = createFakeBillingDb();

    const [a, b] = await Promise.all([ensure(db), ensure(db)]);

    expect(db.state.customers).toHaveLength(1);
    const winner = db.state.customers[0].abacate_customer_id;
    expect(a.customerId).toBe(winner);
    expect(b.customerId).toBe(winner);
    const loser = [a, b].find((r) => !r.created)!;
    expect([a, b].filter((r) => r.created)).toHaveLength(1);
    expect(loser.orphanCustomerId).toBeDefined();
    expect(loser.orphanCustomerId).not.toBe(winner);
  });

  test('falha do provedor sobe e nada é gravado', async () => {
    routeFetch(fetchMock, () => errorEnvelope('boom', 500));
    const db = createFakeBillingDb();

    await expect(ensure(db)).rejects.toMatchObject({ name: 'AbacatePayError', status: 500 });
    expect(db.state.customers).toEqual([]);
  });

  test('rowCount 0 sem linha do usuário (estado impossível) falha alto', async () => {
    const db = createFakeBillingDb();
    const inner = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (config: QueryConfig) => {
      if (config.text.includes('INSERT INTO billing_customers')) return { rows: [], rowCount: 0 };
      return inner(config);
    });

    await expect(ensure(db)).rejects.toThrow('billing_customers sem linha para o usuário 7');
  });

  test('o SQL (contrato com o banco)', async () => {
    const db = createFakeBillingDb();

    await ensure(db);

    expect(db.statements()).toMatchSnapshot();
  });
});
