import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

// `services/recurringExpenses` importa `../db`, que resolve a URL no
// module-eval. Este arquivo só exercita as funções puras de data, mas ainda
// assim aponta para um arquivo temp para não tocar o banco de desenvolvimento.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-recurring-service-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('recurring expenses date helpers (T-035)', () => {
  let daysInMonth: (monthKey: string) => number;
  let occurrenceDate: (monthKey: string, dayOfMonth: number) => string;

  beforeAll(async () => {
    ({ daysInMonth, occurrenceDate } = await import('./recurringExpenses'));
  });

  it('counts days of 31/30-day months', () => {
    expect(daysInMonth('2026-01')).toBe(31);
    expect(daysInMonth('2026-04')).toBe(30);
    expect(daysInMonth('2026-12')).toBe(31);
  });

  it('counts february in common and leap years', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    // 2000 é bissexto (divisível por 400), 1900 não é (divisível por 100).
    expect(daysInMonth('2000-02')).toBe(29);
    expect(daysInMonth('1900-02')).toBe(28);
  });

  it('returns 0 for malformed month keys', () => {
    expect(daysInMonth('2026-13')).toBe(0);
    expect(daysInMonth('julho')).toBe(0);
  });

  it('keeps the day when the month is long enough', () => {
    expect(occurrenceDate('2026-08', 10)).toBe('2026-08-10');
    expect(occurrenceDate('2026-08', 31)).toBe('2026-08-31');
  });

  it('clamps day 31 to the last day of short months', () => {
    expect(occurrenceDate('2026-02', 31)).toBe('2026-02-28');
    expect(occurrenceDate('2028-02', 31)).toBe('2028-02-29');
    expect(occurrenceDate('2026-04', 31)).toBe('2026-04-30');
    expect(occurrenceDate('2026-11', 31)).toBe('2026-11-30');
  });

  it('clamps days 29 and 30 in february', () => {
    expect(occurrenceDate('2026-02', 29)).toBe('2026-02-28');
    expect(occurrenceDate('2026-02', 30)).toBe('2026-02-28');
    expect(occurrenceDate('2028-02', 29)).toBe('2028-02-29');
    expect(occurrenceDate('2028-02', 30)).toBe('2028-02-29');
  });

  it('never overflows into the next month', () => {
    for (const month of ['2026-01', '2026-02', '2026-04', '2026-06', '2028-02']) {
      for (const day of [1, 15, 28, 29, 30, 31]) {
        expect(occurrenceDate(month, day).slice(0, 7)).toBe(month);
      }
    }
  });

  it('floors the day at 1', () => {
    expect(occurrenceDate('2026-05', 0)).toBe('2026-05-01');
    expect(occurrenceDate('2026-05', -3)).toBe('2026-05-01');
  });

  it('zero-pads single-digit days', () => {
    expect(occurrenceDate('2026-05', 5)).toBe('2026-05-05');
  });
});

// ── T-045: isUniqueViolation exercitada diretamente ─────────────────────────
// Antes só era exercitada indiretamente via a corrida simulada em
// `materializeRecurringExpenses`. Aqui testamos a função isolada com os
// formatos de erro que ela precisa distinguir.
describe('isUniqueViolation (T-045)', () => {
  let isUniqueViolation: (err: unknown) => boolean;

  beforeAll(async () => {
    ({ isUniqueViolation } = await import('./recurringExpenses'));
  });

  it('recognizes SQLITE_CONSTRAINT_UNIQUE by code', () => {
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_UNIQUE' })).toBe(true);
  });

  it('recognizes SQLITE_CONSTRAINT_PRIMARYKEY by code', () => {
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_PRIMARYKEY' })).toBe(true);
  });

  it('recognizes a UNIQUE constraint failure by message when code is absent', () => {
    expect(isUniqueViolation(new Error('UNIQUE constraint failed: recurring_expense_months.recurring_id, recurring_expense_months.month'))).toBe(
      true,
    );
  });

  it('does not treat a foreign key violation as a unique violation', () => {
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })).toBe(false);
  });

  it('does not treat a generic/NOT NULL constraint error as a unique violation', () => {
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_NOTNULL' })).toBe(false);
    expect(isUniqueViolation(new Error('NOT NULL constraint failed: expense_entries.date'))).toBe(
      false,
    );
  });

  it('does not treat an unrelated error as a unique violation', () => {
    expect(isUniqueViolation(new Error('network timeout'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});

// ── T-045: criação transacional do lançamento recorrente ────────────────────
// A criação com `recurring: true` grava três coisas — o template
// (recurring_expenses), a reserva do mês (recurring_expense_months) e a
// primeira ocorrência (expense_entries) — no MESMO `db.transaction('write')`
// (ver createRecurringExpenseEntry). Estes testes usam o banco real (não um
// mock) para provar que uma falha na ÚLTIMA escrita não deixa as duas
// anteriores gravadas — o cenário de "template órfão"/"mês reservado sem
// lançamento" que motivou a tarefa.
describe('createRecurringExpenseEntry (T-045)', () => {
  let createRecurringExpenseEntry: (params: {
    userId: number;
    description: string;
    category: string;
    amount: number;
    date: string;
    dayOfMonth: number;
    startMonth: string;
    entryMonth: string;
  }) => Promise<{ entryId: number; recurringId: number }>;
  let db: typeof import('@vetor-wallet/db').db;
  let userId: number;

  beforeAll(async () => {
    ({ createRecurringExpenseEntry } = await import('./recurringExpenses'));
    ({ db } = await import('@vetor-wallet/db'));
    const { initDb } = await import('@vetor-wallet/db');
    await initDb();

    const created = await db.execute({
      sql: "INSERT INTO users (email, password_hash) VALUES (?, 'x')",
      args: ['recurring-tx-test@test.com'],
    });
    userId = Number(created.lastInsertRowid);
  });

  it('commits all three writes atomically on success', async () => {
    const result = await createRecurringExpenseEntry({
      userId,
      description: 'Assinatura OK',
      category: 'casa',
      amount: 29.9,
      date: '2026-08-10',
      dayOfMonth: 10,
      startMonth: '2026-08',
      entryMonth: '2026-08',
    });

    expect(result.recurringId).toBeGreaterThan(0);
    expect(result.entryId).toBeGreaterThan(0);

    const recurrence = await db.execute({
      sql: 'SELECT id FROM recurring_expenses WHERE id = ?',
      args: [result.recurringId],
    });
    expect(recurrence.rows.length).toBe(1);

    const month = await db.execute({
      sql: 'SELECT id FROM recurring_expense_months WHERE recurring_id = ? AND month = ?',
      args: [result.recurringId, '2026-08'],
    });
    expect(month.rows.length).toBe(1);

    const entry = await db.execute({
      sql: 'SELECT recurring_id FROM expense_entries WHERE id = ?',
      args: [result.entryId],
    });
    expect(entry.rows.length).toBe(1);
    expect(Number(entry.rows[0].recurring_id)).toBe(result.recurringId);
  });

  it('leaves no orphan template or month reservation when the final write fails', async () => {
    const description = 'Assinatura que vai falhar';

    // `date: null` viola o NOT NULL de expense_entries.date na TERCEIRA
    // escrita da transação — depois de o template e a reserva do mês já
    // terem sido executados (mas não commitados) na mesma transação. Se o
    // rollback não cobrisse as escritas anteriores, o template e o mês
    // reservado ficariam órfãos mesmo com o lançamento nunca existindo.
    await expect(
      createRecurringExpenseEntry({
        userId,
        description,
        category: 'casa',
        amount: 10,
        date: null as unknown as string,
        dayOfMonth: 5,
        startMonth: '2026-09',
        entryMonth: '2026-09',
      }),
    ).rejects.toThrow();

    const recurrence = await db.execute({
      sql: 'SELECT id FROM recurring_expenses WHERE description = ?',
      args: [description],
    });
    expect(recurrence.rows.length).toBe(0);

    const months = await db.execute({
      sql: `SELECT recurring_expense_months.id AS id
            FROM recurring_expense_months
            JOIN recurring_expenses ON recurring_expenses.id = recurring_expense_months.recurring_id
            WHERE recurring_expenses.description = ?`,
      args: [description],
    });
    expect(months.rows.length).toBe(0);

    const entries = await db.execute({
      sql: 'SELECT id FROM expense_entries WHERE description = ?',
      args: [description],
    });
    expect(entries.rows.length).toBe(0);
  });

  it('still works after a previous failed attempt (transaction is fully released)', async () => {
    // Reforça que o `tx.close()` no `finally` de fato libera a transação
    // anterior — sem isso, uma tentativa subsequente ficaria travada
    // esperando a transação de escrita anterior (o libsql serializa
    // transações de escrita).
    const result = await createRecurringExpenseEntry({
      userId,
      description: 'Assinatura depois da falha',
      category: 'casa',
      amount: 15,
      date: '2026-09-05',
      dayOfMonth: 5,
      startMonth: '2026-09',
      entryMonth: '2026-09',
    });
    expect(result.entryId).toBeGreaterThan(0);
  });
});
