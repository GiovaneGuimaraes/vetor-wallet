import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

/**
 * Idempotência da sincronização Pluggy (T-087) contra banco de verdade.
 *
 * Banco temporário próprio deste arquivo + `DATABASE_URL` setado ANTES do
 * `await import(...)`: `@vetor-wallet/db` lê o env no top-level do módulo, e um
 * `import` estático de `./pluggy` (que importa `db`) seria hoisted acima disso.
 */
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-pluggy-import-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

// `import type` é apagado na compilação: não carrega o módulo (que importaria
// `db`) antes do set de DATABASE_URL acima.
import type { RawPluggyTransaction } from './pluggy';

type Db = (typeof import('@vetor-wallet/db'))['db'];
type PluggyModule = typeof import('./pluggy');

let db: Db;
let pluggy: PluggyModule;
let userId: number;

function raw(overrides: Partial<RawPluggyTransaction> = {}): RawPluggyTransaction {
  return {
    id: 'tx-1',
    date: '2026-08-11T00:00:00.000Z',
    description: 'Supermercado',
    descriptionRaw: null,
    amount: -100.5,
    type: 'DEBIT',
    category: null,
    currencyCode: 'BRL',
    status: 'POSTED',
    ...overrides,
  };
}

beforeAll(async () => {
  const dbMod = await import('@vetor-wallet/db');
  db = dbMod.db;
  await dbMod.initDb();
  pluggy = await import('./pluggy');
});

beforeEach(async () => {
  await db.execute('DELETE FROM income_entries');
  await db.execute('DELETE FROM expense_entries');
  await db.execute('DELETE FROM users');
  const inserted = await db.execute({
    sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    args: [`pluggy-${Math.random().toString(36).slice(2)}@test.local`, 'x'],
  });
  userId = Number(inserted.lastInsertRowid ?? 0);
});

async function countEntries(): Promise<{ income: number; expense: number }> {
  const income = await db.execute('SELECT COUNT(*) AS c FROM income_entries');
  const expense = await db.execute('SELECT COUNT(*) AS c FROM expense_entries');
  return { income: Number(income.rows[0].c), expense: Number(expense.rows[0].c) };
}

describe('importPluggyTransactions — gravação (T-087)', () => {
  it('grava débito em expense_entries e crédito em income_entries, com external_id prefixado', async () => {
    const result = await pluggy.importPluggyTransactions({
      userId,
      transactions: [
        raw({ id: 'tx-debito' }),
        raw({ id: 'tx-credito', type: 'CREDIT', amount: 4200, description: 'Salário' }),
      ],
    });

    expect(result).toMatchObject({ imported: 2, duplicated: 0, rejected: 0, skipped: 0 });
    expect(await countEntries()).toEqual({ income: 1, expense: 1 });

    const expense = await db.execute('SELECT * FROM expense_entries');
    expect(expense.rows[0]).toMatchObject({
      external_id: 'pluggy:tx-debito',
      amount: 100.5,
      date: '2026-08-11',
      category: 'supermercado',
    });

    const income = await db.execute('SELECT * FROM income_entries');
    expect(income.rows[0]).toMatchObject({ external_id: 'pluggy:tx-credito', amount: 4200 });

    // O relatório traz o id da linha gravada.
    expect(result.transactions[0].entryId).toBe(Number(expense.rows[0].id));
  });

  it('é idempotente: a 2ª sincronização do mesmo payload grava 0 e reporta N duplicadas', async () => {
    const transactions = [
      raw({ id: 'tx-a' }),
      raw({ id: 'tx-b', amount: -20 }),
      raw({ id: 'tx-c', type: 'CREDIT', amount: 300 }),
    ];

    const first = await pluggy.importPluggyTransactions({ userId, transactions });
    expect(first).toMatchObject({ imported: 3, duplicated: 0 });
    expect(await countEntries()).toEqual({ income: 1, expense: 2 });

    const second = await pluggy.importPluggyTransactions({ userId, transactions });
    expect(second).toMatchObject({ imported: 0, duplicated: 3, rejected: 0, skipped: 0 });
    expect(second.transactions.every((t) => t.status === 'duplicated')).toBe(true);
    // Nada de novo no banco.
    expect(await countEntries()).toEqual({ income: 1, expense: 2 });

    // A duplicata devolve o id da linha JÁ existente (sem busca extra).
    const existing = await db.execute(
      "SELECT id FROM expense_entries WHERE external_id = 'pluggy:tx-a'"
    );
    expect(second.transactions[0].entryId).toBe(Number(existing.rows[0].id));
  });

  it('id repetido DENTRO do mesmo lote cai como duplicata (INSERTs sequenciais)', async () => {
    const result = await pluggy.importPluggyTransactions({
      userId,
      transactions: [raw({ id: 'tx-repetido' }), raw({ id: 'tx-repetido' })],
    });

    expect(result).toMatchObject({ imported: 1, duplicated: 1 });
    expect((await countEntries()).expense).toBe(1);
  });

  it('a transação PENDING não grava; quando volta POSTED, grava (armadilha de idempotência)', async () => {
    // 1ª passagem: pendente, com valor PROVISÓRIO.
    const pending = await pluggy.importPluggyTransactions({
      userId,
      transactions: [raw({ id: 'tx-pend', amount: -10, status: 'PENDING' })],
    });
    expect(pending).toMatchObject({ imported: 0, skipped: 1, rejected: 0 });
    expect(pending.transactions[0]).toMatchObject({ status: 'skipped', transactionId: 'tx-pend' });
    expect((await countEntries()).expense).toBe(0);

    // 2ª passagem: mesma transação efetivada, com o valor DEFINITIVO.
    const posted = await pluggy.importPluggyTransactions({
      userId,
      transactions: [raw({ id: 'tx-pend', amount: -12.35, status: 'POSTED' })],
    });
    expect(posted).toMatchObject({ imported: 1, skipped: 0 });

    const rows = await db.execute(
      "SELECT * FROM expense_entries WHERE external_id = 'pluggy:tx-pend'"
    );
    expect(rows.rows).toHaveLength(1);
    // Se a pendente tivesse sido gravada, o valor provisório (10) ficaria
    // congelado — a 2ª passagem cairia como duplicata.
    expect(rows.rows[0].amount).toBe(12.35);
  });

  it('mistura desfechos num relatório só, sem derrubar o lote', async () => {
    const result = await pluggy.importPluggyTransactions({
      userId,
      transactions: [
        raw({ id: 'tx-ok' }),
        raw({ id: null }),
        raw({ id: 'tx-usd', currencyCode: 'USD' }),
        raw({ id: 'tx-pend', status: 'PENDING' }),
        raw({ id: 'tx-ok' }),
      ],
    });

    expect(result).toMatchObject({ imported: 1, duplicated: 1, rejected: 2, skipped: 1 });
    expect(result.transactions.map((t) => t.status)).toEqual([
      'imported',
      'rejected',
      'rejected',
      'skipped',
      'duplicated',
    ]);
    expect((await countEntries()).expense).toBe(1);
  });

  it('dedupe é por usuário: outro usuário importa o MESMO id', async () => {
    const other = await db.execute({
      sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      args: [`pluggy-other-${Math.random().toString(36).slice(2)}@test.local`, 'x'],
    });
    const otherId = Number(other.lastInsertRowid ?? 0);

    await pluggy.importPluggyTransactions({ userId, transactions: [raw({ id: 'tx-x' })] });
    const second = await pluggy.importPluggyTransactions({
      userId: otherId,
      transactions: [raw({ id: 'tx-x' })],
    });

    expect(second).toMatchObject({ imported: 1, duplicated: 0 });
    expect((await countEntries()).expense).toBe(2);
  });
});

describe('importPluggyTransactions — dry-run (T-087)', () => {
  it('não grava NADA e marca as linhas mapeadas como `previewed`', async () => {
    const result = await pluggy.importPluggyTransactions({
      userId,
      dryRun: true,
      transactions: [
        raw({ id: 'tx-a' }),
        raw({ id: 'tx-b', type: 'CREDIT', amount: 700 }),
        raw({ id: null }),
        raw({ id: 'tx-pend', status: 'PENDING' }),
      ],
    });

    expect(result).toMatchObject({
      imported: 0,
      duplicated: 0,
      previewed: 2,
      rejected: 1,
      skipped: 1,
    });
    expect(await countEntries()).toEqual({ income: 0, expense: 0 });
    expect(result.transactions[0]).toMatchObject({
      status: 'previewed',
      transactionId: 'tx-a',
      amount: 100.5,
      entryType: 'expense',
    });
  });

  it('dry-run não consome a chave: a gravação seguinte importa normalmente', async () => {
    await pluggy.importPluggyTransactions({ userId, dryRun: true, transactions: [raw()] });
    const real = await pluggy.importPluggyTransactions({ userId, transactions: [raw()] });
    expect(real).toMatchObject({ imported: 1, duplicated: 0 });
  });
});
