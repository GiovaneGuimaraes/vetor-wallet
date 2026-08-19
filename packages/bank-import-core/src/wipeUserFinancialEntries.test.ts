import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

/** Banco temporário próprio + DATABASE_URL ANTES do import (ver pluggyImport.test.ts). */
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-wipe-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

type Db = (typeof import('@vetor-wallet/db'))['db'];
type WipeModule = typeof import('./wipeUserFinancialEntries');

let db: Db;
let wipe: WipeModule;
let userId: number;
let otherId: number;

async function newUser(): Promise<number> {
  const res = await db.execute({
    sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    args: [`wipe-${Math.random().toString(36).slice(2)}@test.local`, 'x'],
  });
  return Number(res.lastInsertRowid ?? 0);
}

async function seed(id: number): Promise<void> {
  await db.execute({
    sql: 'INSERT INTO income_entries (user_id, description, amount, date) VALUES (?, ?, ?, ?)',
    args: [id, 'Salário', 4200, '2026-08-05'],
  });
  await db.execute({
    sql: 'INSERT INTO expense_entries (user_id, description, amount, date, category) VALUES (?, ?, ?, ?, ?)',
    args: [id, 'Mercado', 237.8, '2026-08-11', 'mercado'],
  });
  await db.execute({
    sql: 'INSERT INTO savings_entries (user_id, type, amount, date) VALUES (?, ?, ?, ?)',
    args: [id, 'DEPOSIT', 1000, '2026-08-01'],
  });
}

async function counts(id: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of ['income_entries', 'expense_entries', 'savings_entries']) {
    const r = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM ${table} WHERE user_id = ?`,
      args: [id],
    });
    out[table] = Number(r.rows[0].c);
  }
  return out;
}

beforeAll(async () => {
  const dbMod = await import('@vetor-wallet/db');
  db = dbMod.db;
  await dbMod.initDb();
  wipe = await import('./wipeUserFinancialEntries');
});

beforeEach(async () => {
  await db.execute('DELETE FROM income_entries');
  await db.execute('DELETE FROM expense_entries');
  await db.execute('DELETE FROM savings_entries');
  await db.execute('DELETE FROM users');
  userId = await newUser();
  otherId = await newUser();
});

describe('wipeUserFinancialEntries (T-089b — modo replace)', () => {
  it('apaga renda, despesa e poupança do usuário e devolve quanto sumiu', async () => {
    await seed(userId);

    const result = await wipe.wipeUserFinancialEntries({ db, userId });

    expect(result).toEqual({ incomeEntries: 1, expenseEntries: 1, savingsEntries: 1 });
    expect(await counts(userId)).toEqual({
      income_entries: 0,
      expense_entries: 0,
      savings_entries: 0,
    });
  });

  it('NÃO toca os dados de outro usuário', async () => {
    await seed(userId);
    await seed(otherId);

    await wipe.wipeUserFinancialEntries({ db, userId });

    expect(await counts(otherId)).toEqual({
      income_entries: 1,
      expense_entries: 1,
      savings_entries: 1,
    });
  });

  it('apaga lançamento manual e importado por igual — é limpeza total', async () => {
    await db.execute({
      sql: 'INSERT INTO expense_entries (user_id, description, amount, date, category, external_id) VALUES (?, ?, ?, ?, ?, ?)',
      args: [userId, 'De OFX', 10, '2026-07-01', 'outros', 'ofx:FIT-1'],
    });
    await db.execute({
      sql: 'INSERT INTO expense_entries (user_id, description, amount, date, category) VALUES (?, ?, ?, ?, ?)',
      args: [userId, 'Digitado à mão', 20, '2026-01-15', 'outros'],
    });

    const result = await wipe.wipeUserFinancialEntries({ db, userId });

    expect(result.expenseEntries).toBe(2);
    expect((await counts(userId)).expense_entries).toBe(0);
  });

  // T-091b2: `goals` e `savings_entries.goal_id` foram APAGADAS do banco. O que
  // sobrou de Metas é o `transfer_group`, coberto pelo teste do par abaixo. O
  // teste antigo ("não apaga linhas de `goals`") saiu com a tabela: não há mais
  // tabela vizinha para o replace preservar.
  it('não apaga nada fora das três tabelas de lançamento', async () => {
    await seed(userId);
    const plansBefore = await db.execute('SELECT COUNT(*) AS c FROM plans');

    await wipe.wipeUserFinancialEntries({ db, userId });

    // O usuário e o catálogo de planos (tabelas vizinhas, uma por usuário e uma
    // global) sobrevivem — o replace é limpeza de lançamento, não de conta.
    const users = await db.execute({
      sql: 'SELECT COUNT(*) AS c FROM users WHERE id = ?',
      args: [userId],
    });
    expect(Number(users.rows[0].c)).toBe(1);
    const plansAfter = await db.execute('SELECT COUNT(*) AS c FROM plans');
    expect(Number(plansAfter.rows[0].c)).toBe(Number(plansBefore.rows[0].c));
  });

  it('o par legado de transferência some INTEIRO — nunca sobra meia ponta (T-041)', async () => {
    for (const type of ['WITHDRAW', 'DEPOSIT']) {
      await db.execute({
        sql: 'INSERT INTO savings_entries (user_id, type, amount, date, transfer_group) VALUES (?, ?, ?, ?, ?)',
        args: [userId, type, 300, '2026-08-03', 'grp-1'],
      });
    }

    await wipe.wipeUserFinancialEntries({ db, userId });

    const left = await db.execute({
      sql: "SELECT COUNT(*) AS c FROM savings_entries WHERE transfer_group = 'grp-1'",
      args: [],
    });
    expect(Number(left.rows[0].c)).toBe(0);
  });

  it('usuário sem nada devolve zeros sem estourar', async () => {
    await expect(wipe.wipeUserFinancialEntries({ db, userId })).resolves.toEqual({
      incomeEntries: 0,
      expenseEntries: 0,
      savingsEntries: 0,
    });
  });
});
