import { markChargePaidAndActivate } from 'src/markChargePaidAndActivate';
import { createMockDb, type MockDb } from 'tests/unit/createMockDb';

const CHARGE_ID = 'pix_char_abc';

const planRow = { id: 1, interval: 'monthly', active: 1 };

/**
 * Roteia as leituras por trecho de SQL em vez de `mockResolvedValueOnce` em
 * sequência: a ordem das queries é detalhe de implementação, e travá-la faria
 * qualquer reordenação inofensiva quebrar o teste.
 */
const stubReads = (
  db: MockDb,
  reads: { charge?: unknown; plan?: unknown; subscription?: unknown },
) => {
  db.execute.mockImplementation(async ({ sql }: { sql: string }) => {
    if (sql.includes('FROM pix_charges')) {
      return { rows: reads.charge ? [reads.charge] : [] };
    }
    if (sql.includes('FROM plans')) {
      return { rows: reads.plan ? [reads.plan] : [] };
    }
    if (sql.includes('FROM subscriptions')) {
      return { rows: reads.subscription ? [reads.subscription] : [] };
    }
    throw new Error(`Query inesperada: ${sql}`);
  });
};

describe('markChargePaidAndActivate', () => {
  let db: MockDb;

  beforeEach(() => {
    db = createMockDb();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('ativa a assinatura e soma o período a partir de agora', async () => {
    stubReads(db, {
      charge: { user_id: 42, plan_id: 1, status: 'PENDING' },
      plan: planRow,
      subscription: undefined,
    });

    const result = await markChargePaidAndActivate({ db, abacateChargeId: CHARGE_ID });

    expect(result).toEqual({ activated: true, userId: 42 });

    const [statements, mode] = db.batch.mock.calls[0];
    // Transação única: ou a cobrança vira PAID e a assinatura fica ativa, ou
    // nada acontece.
    expect(mode).toBe('write');
    expect(statements).toHaveLength(2);
    expect(statements[0].args).toEqual([CHARGE_ID]);
    expect(statements[1].args).toEqual([42, 1, '2026-09-01 12:00:00']);
    expect(statements.map((s: { sql: string }) => s.sql)).toMatchSnapshot();
  });

  test('renovando antes de vencer, soma ao que resta do período vigente', async () => {
    stubReads(db, {
      charge: { user_id: 42, plan_id: 1, status: 'PENDING' },
      plan: planRow,
      subscription: { current_period_end: '2026-09-10 00:00:00' },
    });

    await markChargePaidAndActivate({ db, abacateChargeId: CHARGE_ID });

    expect(db.batch.mock.calls[0][0][1].args).toEqual([42, 1, '2026-10-10 00:00:00']);
  });

  test('renovando depois de vencer, conta a partir de agora', async () => {
    stubReads(db, {
      charge: { user_id: 42, plan_id: 1, status: 'PENDING' },
      plan: planRow,
      subscription: { current_period_end: '2026-07-01 00:00:00' },
    });

    await markChargePaidAndActivate({ db, abacateChargeId: CHARGE_ID });

    expect(db.batch.mock.calls[0][0][1].args).toEqual([42, 1, '2026-09-01 12:00:00']);
  });

  test('plano anual soma um ano', async () => {
    stubReads(db, {
      charge: { user_id: 42, plan_id: 1, status: 'PENDING' },
      plan: { ...planRow, interval: 'yearly' },
    });

    await markChargePaidAndActivate({ db, abacateChargeId: CHARGE_ID });

    expect(db.batch.mock.calls[0][0][1].args).toEqual([42, 1, '2027-08-01 12:00:00']);
  });

  test('o UPDATE tem a trava `status <> PAID` contra chamadas concorrentes', async () => {
    stubReads(db, {
      charge: { user_id: 42, plan_id: 1, status: 'PENDING' },
      plan: planRow,
    });

    await markChargePaidAndActivate({ db, abacateChargeId: CHARGE_ID });

    expect(db.batch.mock.calls[0][0][0].sql).toContain("status <> 'PAID'");
  });

  test('é IDEMPOTENTE: cobrança já PAID não soma período de novo', async () => {
    // Webhook e polling chegando juntos é o caso real; a segunda chamada tem de
    // ser inócua.
    stubReads(db, {
      charge: { user_id: 42, plan_id: 1, status: 'PAID' },
      plan: planRow,
    });

    const result = await markChargePaidAndActivate({ db, abacateChargeId: CHARGE_ID });

    expect(result).toEqual({ activated: false, userId: 42 });
    expect(db.batch).not.toHaveBeenCalled();
  });

  test('cobrança desconhecida não ativa nada e não revela dono', async () => {
    stubReads(db, { charge: undefined });

    const result = await markChargePaidAndActivate({ db, abacateChargeId: 'nao-existe' });

    expect(result).toEqual({ activated: false, userId: null });
    expect(db.batch).not.toHaveBeenCalled();
  });

  test('plano sumido do catálogo não ativa, mas ainda reporta o dono', async () => {
    stubReads(db, {
      charge: { user_id: 42, plan_id: 99, status: 'PENDING' },
      plan: undefined,
    });

    const result = await markChargePaidAndActivate({ db, abacateChargeId: CHARGE_ID });

    expect(result).toEqual({ activated: false, userId: 42 });
    expect(db.batch).not.toHaveBeenCalled();
  });

  test('plano DESATIVADO depois da compra ainda ativa (o dinheiro entrou)', async () => {
    stubReads(db, {
      charge: { user_id: 42, plan_id: 1, status: 'PENDING' },
      plan: { ...planRow, active: 0 },
    });

    const result = await markChargePaidAndActivate({ db, abacateChargeId: CHARGE_ID });

    expect(result.activated).toBe(true);
  });

  test('o dono vem de pix_charges.user_id, buscado pelo id do provedor', async () => {
    // Nunca de `metadata.userId` do payload: é dado de fora e ativaria a
    // assinatura de outra pessoa se forjado. Por isso a função só recebe o id
    // da cobrança.
    stubReads(db, {
      charge: { user_id: 7, plan_id: 1, status: 'PENDING' },
      plan: planRow,
    });

    await markChargePaidAndActivate({ db, abacateChargeId: CHARGE_ID });

    const lookup = db.execute.mock.calls.find(([stmt]: [{ sql: string }]) =>
      stmt.sql.includes('FROM pix_charges'),
    );
    expect(lookup[0].args).toEqual([CHARGE_ID]);
    expect(db.batch.mock.calls[0][0][1].args[0]).toBe(7);
  });

  test('normaliza user_id e plan_id que o driver devolve como string', async () => {
    stubReads(db, {
      charge: { user_id: '42', plan_id: '1', status: 'PENDING' },
      plan: planRow,
    });

    const result = await markChargePaidAndActivate({ db, abacateChargeId: CHARGE_ID });

    expect(result.userId).toBe(42);
    expect(db.execute.mock.calls.some(([stmt]: [{ args: unknown[] }]) =>
      JSON.stringify(stmt.args) === JSON.stringify([1]),
    )).toBe(true);
  });
});
