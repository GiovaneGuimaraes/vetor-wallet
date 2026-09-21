import { tmpdir } from 'os';
import path from 'path';
import { createRecurringExpenseEntry } from 'src/createRecurringExpenseEntry';
import type { TransactionalDb } from 'src/TransactionalDb';

// Este é o ÚNICO teste do package que usa um client real, contra um arquivo
// temporário — e é deliberado: ele prova ROLLBACK de transação (T-045), e um
// mock não provaria rollback nenhum, só que o mock foi chamado.
//
// O que mudou com a injeção (T-110c): antes o módulo importava o singleton do
// `db`, que lê `DATABASE_URL` no top-level — então o teste tinha que setar o
// env e usar `await import()` dinâmico para controlar a ordem. Agora o client é
// um parâmetro: cria-se um, passa-se, acabou.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-recurring-tx-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.split(path.sep).join('/')}`;

describe('createRecurringExpenseEntry (T-045)', () => {
  let db: TransactionalDb;
  let userId: number;

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    await dbModule.initDb();
    db = dbModule.db as unknown as TransactionalDb;

    const created = await db.execute({
      sql: "INSERT INTO users (email, password_hash) VALUES (?, 'x')",
      args: ['recurring-tx-test@test.com'],
    });
    userId = Number(created.lastInsertRowid);
  });

  it('grava as três escritas atomicamente no caminho feliz', async () => {
    const result = await createRecurringExpenseEntry({
      db,
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

  it('não deixa template órfão nem mês reservado quando a última escrita falha', async () => {
    const description = 'Assinatura que vai falhar';

    // `date: null` viola o NOT NULL de expense_entries.date na TERCEIRA escrita
    // da transação — depois de o template e a reserva do mês já terem sido
    // executados (mas não commitados). Se o rollback não cobrisse as escritas
    // anteriores, o template e o mês ficariam órfãos.
    await expect(
      createRecurringExpenseEntry({
        db,
        userId,
        description,
        category: 'casa',
        amount: 10,
        date: null as unknown as string,
        dayOfMonth: 5,
        startMonth: '2026-09',
        entryMonth: '2026-09',
      })
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

  it('segue funcionando depois de uma tentativa falha (a transação foi liberada)', async () => {
    // Reforça que o `close()` no `finally` de fato libera a transação anterior —
    // sem isso, a tentativa seguinte ficaria travada esperando (o libsql
    // serializa transações de escrita).
    const result = await createRecurringExpenseEntry({
      db,
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

  it('recusa quando o INSERT do template não devolve id', async () => {
    const semId = {
      transaction: async () => ({
        execute: async () => ({ lastInsertRowid: undefined, rows: [] }),
        commit: async () => undefined,
        close: () => undefined,
      }),
    } as unknown as TransactionalDb;

    await expect(
      createRecurringExpenseEntry({
        db: semId,
        userId: 1,
        description: 'x',
        category: 'casa',
        amount: 1,
        date: '2026-09-05',
        dayOfMonth: 5,
        startMonth: '2026-09',
        entryMonth: '2026-09',
      })
    ).rejects.toThrow('lastInsertRowid ausente');
  });

  it('devolve entryId 0 quando a ocorrência não expõe o rowid', async () => {
    let chamada = 0;
    const semRowidFinal = {
      transaction: async () => ({
        execute: async () => {
          chamada += 1;
          return { lastInsertRowid: chamada === 1 ? 5n : undefined, rows: [] };
        },
        commit: async () => undefined,
        close: () => undefined,
      }),
    } as unknown as TransactionalDb;

    const result = await createRecurringExpenseEntry({
      db: semRowidFinal,
      userId: 1,
      description: 'x',
      category: 'casa',
      amount: 1,
      date: '2026-09-05',
      dayOfMonth: 5,
      startMonth: '2026-09',
      entryMonth: '2026-09',
    });
    expect(result).toEqual({ entryId: 0, recurringId: 5 });
  });
});
