import { markChargePaidAndActivate } from 'src/markChargePaidAndActivate';
import { createTestQuery, type MockQuery } from 'tests/unit/testQuery';

const CHARGE_ID = 'pix_char_abc';

const planRow = { id: 1, interval: 'monthly', active: 1 };

/**
 * Roteia as leituras por trecho de SQL em vez de `mockResolvedValueOnce` em
 * sequência: a ordem das queries é detalhe de implementação, e travá-la faria
 * qualquer reordenação inofensiva quebrar o teste.
 *
 * As DUAS escritas (UPDATE de `pix_charges` e o UPSERT de `subscriptions`)
 * não precisam de stub: o default do `createTestQuery` (`{ rows: [],
 * rowCount: 0 }`) já serve, porque `markChargePaidAndActivate` não lê o
 * retorno delas.
 */
const stubReads = (
  query: MockQuery,
  reads: { charge?: unknown; plan?: unknown; subscription?: unknown }
) => {
  query.mockImplementation(async ({ text }: { text: string }) => {
    if (text.includes('SELECT user_id, plan_id, status FROM pix_charges')) {
      return { rows: reads.charge ? [reads.charge] : [], rowCount: reads.charge ? 1 : 0 };
    }
    if (text.includes('FROM plans')) {
      return { rows: reads.plan ? [reads.plan] : [], rowCount: reads.plan ? 1 : 0 };
    }
    if (text.includes('FROM subscriptions')) {
      return {
        rows: reads.subscription ? [reads.subscription] : [],
        rowCount: reads.subscription ? 1 : 0,
      };
    }
    // UPDATE pix_charges e INSERT INTO subscriptions: a função não lê o
    // retorno, então um resultado vazio basta.
    return { rows: [], rowCount: 0 };
  });
};

describe('markChargePaidAndActivate', () => {
  let query: MockQuery;

  beforeEach(() => {
    query = createTestQuery();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const writeCalls = () =>
    query.mock.calls
      .map(([config]: [{ text: string; values: unknown }]) => config)
      .filter(({ text }: { text: string }) => text.includes('UPDATE ') || text.includes('INSERT '));

  test('ativa a assinatura e soma o período a partir de agora', async () => {
    stubReads(query, {
      charge: { user_id: 42, plan_id: 1, status: 'PENDING' },
      plan: planRow,
      subscription: undefined,
    });

    const result = await markChargePaidAndActivate({ query, abacateChargeId: CHARGE_ID });

    expect(result).toEqual({ activated: true, userId: 42 });

    // Transação virou duas chamadas sequenciais (sem transação interativa por
    // proxy em `@vetor-wallet/query`): ou a cobrança vira PAID e a assinatura
    // fica ativa, ou — por causa da trava `status <> 'PAID'` e do
    // `ON CONFLICT` — nada muda numa segunda chamada.
    const writes = writeCalls();
    expect(writes).toHaveLength(2);
    expect(writes[0].values).toEqual([CHARGE_ID]);
    expect(writes[1].values).toEqual([42, 1, '2026-09-01 12:00:00']);
    expect(writes.map((w: { text: string }) => w.text)).toMatchSnapshot();
  });

  test('renovando antes de vencer, soma ao que resta do período vigente', async () => {
    stubReads(query, {
      charge: { user_id: 42, plan_id: 1, status: 'PENDING' },
      plan: planRow,
      subscription: { current_period_end: '2026-09-10 00:00:00' },
    });

    await markChargePaidAndActivate({ query, abacateChargeId: CHARGE_ID });

    expect(writeCalls()[1].values).toEqual([42, 1, '2026-10-10 00:00:00']);
  });

  test('renovando depois de vencer, conta a partir de agora', async () => {
    stubReads(query, {
      charge: { user_id: 42, plan_id: 1, status: 'PENDING' },
      plan: planRow,
      subscription: { current_period_end: '2026-07-01 00:00:00' },
    });

    await markChargePaidAndActivate({ query, abacateChargeId: CHARGE_ID });

    expect(writeCalls()[1].values).toEqual([42, 1, '2026-09-01 12:00:00']);
  });

  test('plano anual soma um ano', async () => {
    stubReads(query, {
      charge: { user_id: 42, plan_id: 1, status: 'PENDING' },
      plan: { ...planRow, interval: 'yearly' },
    });

    await markChargePaidAndActivate({ query, abacateChargeId: CHARGE_ID });

    expect(writeCalls()[1].values).toEqual([42, 1, '2027-08-01 12:00:00']);
  });

  test('o UPDATE tem a trava `status <> PAID` contra chamadas concorrentes', async () => {
    stubReads(query, {
      charge: { user_id: 42, plan_id: 1, status: 'PENDING' },
      plan: planRow,
    });

    await markChargePaidAndActivate({ query, abacateChargeId: CHARGE_ID });

    expect(writeCalls()[0].text).toContain("status <> 'PAID'");
  });

  test('é IDEMPOTENTE: cobrança já PAID não soma período de novo', async () => {
    // Webhook e polling chegando juntos é o caso real; a segunda chamada tem de
    // ser inócua.
    stubReads(query, {
      charge: { user_id: 42, plan_id: 1, status: 'PAID' },
      plan: planRow,
    });

    const result = await markChargePaidAndActivate({ query, abacateChargeId: CHARGE_ID });

    expect(result).toEqual({ activated: false, userId: 42 });
    expect(writeCalls()).toHaveLength(0);
  });

  test('cobrança desconhecida não ativa nada e não revela dono', async () => {
    stubReads(query, { charge: undefined });

    const result = await markChargePaidAndActivate({ query, abacateChargeId: 'nao-existe' });

    expect(result).toEqual({ activated: false, userId: null });
    expect(writeCalls()).toHaveLength(0);
  });

  test('plano sumido do catálogo não ativa, mas ainda reporta o dono', async () => {
    stubReads(query, {
      charge: { user_id: 42, plan_id: 99, status: 'PENDING' },
      plan: undefined,
    });

    const result = await markChargePaidAndActivate({ query, abacateChargeId: CHARGE_ID });

    expect(result).toEqual({ activated: false, userId: 42 });
    expect(writeCalls()).toHaveLength(0);
  });

  test('plano DESATIVADO depois da compra ainda ativa (o dinheiro entrou)', async () => {
    stubReads(query, {
      charge: { user_id: 42, plan_id: 1, status: 'PENDING' },
      plan: { ...planRow, active: 0 },
    });

    const result = await markChargePaidAndActivate({ query, abacateChargeId: CHARGE_ID });

    expect(result.activated).toBe(true);
  });

  test('o dono vem de pix_charges.user_id, buscado pelo id do provedor', async () => {
    // Nunca de `metadata.userId` do payload: é dado de fora e ativaria a
    // assinatura de outra pessoa se forjado. Por isso a função só recebe o id
    // da cobrança.
    stubReads(query, {
      charge: { user_id: 7, plan_id: 1, status: 'PENDING' },
      plan: planRow,
    });

    await markChargePaidAndActivate({ query, abacateChargeId: CHARGE_ID });

    const lookup = query.mock.calls.find(([config]: [{ text: string }]) =>
      config.text.includes('SELECT user_id, plan_id, status FROM pix_charges')
    );
    expect(lookup[0].values).toEqual([CHARGE_ID]);
    expect(writeCalls()[1].values[0]).toBe(7);
  });

  test('normaliza user_id e plan_id que o driver devolve como string', async () => {
    stubReads(query, {
      charge: { user_id: '42', plan_id: '1', status: 'PENDING' },
      plan: planRow,
    });

    const result = await markChargePaidAndActivate({ query, abacateChargeId: CHARGE_ID });

    expect(result.userId).toBe(42);
    expect(
      query.mock.calls.some(
        ([config]: [{ values: unknown[] }]) => JSON.stringify(config.values) === JSON.stringify([1])
      )
    ).toBe(true);
  });
});
