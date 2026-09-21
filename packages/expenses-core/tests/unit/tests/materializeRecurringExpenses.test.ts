import { materializeRecurringExpenses } from 'src/materializeRecurringExpenses';
import type { Db } from '@vetor-wallet/db';

/** `Db` de teste com controle fino: aqui importam as chamadas de `batch`. */
function makeDb(options: {
  ativas?: unknown[];
  jaGerados?: unknown[];
  aoGravar?: (n: number) => void;
}) {
  const batches: unknown[][] = [];
  let leituras = 0;
  const db = {
    execute: async () => {
      leituras += 1;
      return leituras === 1
        ? { rows: options.ativas ?? [], rowsAffected: 0 }
        : { rows: options.jaGerados ?? [], rowsAffected: 0 };
    },
    batch: async (stmts: unknown[]) => {
      options.aoGravar?.(batches.length + 1);
      batches.push(stmts);
      return [];
    },
  } as unknown as Db;
  return { db, batches };
}

const recorrencia = {
  id: 1,
  description: 'Assinatura',
  category: 'Casa',
  amount: 30,
  day_of_month: 31,
  start_month: '2026-08',
};

describe('materializeRecurringExpenses (T-035)', () => {
  it('não faz nada quando nenhum mês é válido', async () => {
    const { db, batches } = makeDb({});
    expect(await materializeRecurringExpenses({ db, userId: 7, months: ['abc', '2026-13'] })).toBe(
      0
    );
    expect(batches).toHaveLength(0);
  });

  it('não faz nada quando o usuário não tem recorrência ativa', async () => {
    const { db, batches } = makeDb({ ativas: [] });
    expect(await materializeRecurringExpenses({ db, userId: 7, months: ['2026-09'] })).toBe(0);
    expect(batches).toHaveLength(0);
  });

  it('gera a ocorrência do mês, com o dia preso ao mês', async () => {
    const { db, batches } = makeDb({ ativas: [recorrencia] });

    expect(await materializeRecurringExpenses({ db, userId: 7, months: ['2026-09'] })).toBe(1);
    expect(batches).toHaveLength(1);

    const [reserva, ocorrencia] = batches[0] as Array<{ sql: string; args: unknown[] }>;
    expect(reserva.sql).toContain('INSERT INTO recurring_expense_months');
    expect(reserva.sql).not.toContain('OR IGNORE');
    expect(ocorrencia.args[4]).toBe('2026-09-30');
  });

  it('ignora mês anterior ao start_month (recorrência não retroage)', async () => {
    const { db, batches } = makeDb({ ativas: [recorrencia] });
    expect(await materializeRecurringExpenses({ db, userId: 7, months: ['2026-07'] })).toBe(0);
    expect(batches).toHaveLength(0);
  });

  it('materializa mês futuro', async () => {
    const { db } = makeDb({ ativas: [recorrencia] });
    expect(await materializeRecurringExpenses({ db, userId: 7, months: ['2027-03'] })).toBe(1);
  });

  it('não regera mês já registrado em recurring_expense_months', async () => {
    const { db, batches } = makeDb({
      ativas: [recorrencia],
      jaGerados: [{ recurring_id: 1, month: '2026-09' }],
    });
    expect(await materializeRecurringExpenses({ db, userId: 7, months: ['2026-09'] })).toBe(0);
    expect(batches).toHaveLength(0);
  });

  it('perdedor de corrida (violação de UNIQUE) não conta e não propaga', async () => {
    const { db } = makeDb({
      ativas: [recorrencia],
      aoGravar: () => {
        throw Object.assign(new Error('UNIQUE constraint failed'), {
          code: 'SQLITE_CONSTRAINT_UNIQUE',
        });
      },
    });
    expect(await materializeRecurringExpenses({ db, userId: 7, months: ['2026-09'] })).toBe(0);
  });

  it('erro que NÃO é violação de unicidade propaga', async () => {
    const { db } = makeDb({
      ativas: [recorrencia],
      aoGravar: () => {
        throw new Error('disco cheio');
      },
    });
    await expect(
      materializeRecurringExpenses({ db, userId: 7, months: ['2026-09'] })
    ).rejects.toThrow('disco cheio');
  });

  it('categoria nula da linha vira string vazia', async () => {
    const { db, batches } = makeDb({ ativas: [{ ...recorrencia, category: null }] });
    await materializeRecurringExpenses({ db, userId: 7, months: ['2026-09'] });
    const [, ocorrencia] = batches[0] as Array<{ args: unknown[] }>;
    expect(ocorrencia.args[2]).toBe('');
  });

  it('gera um lote por mês pendente', async () => {
    const { db, batches } = makeDb({ ativas: [recorrencia] });
    expect(
      await materializeRecurringExpenses({ db, userId: 7, months: ['2026-09', '2026-10'] })
    ).toBe(2);
    expect(batches).toHaveLength(2);
  });
});
