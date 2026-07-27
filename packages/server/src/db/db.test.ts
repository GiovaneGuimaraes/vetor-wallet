import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

// Banco temporário próprio por arquivo de teste. `import` estático de '../db'
// seria hoisted acima do set de DATABASE_URL, então o módulo db é importado
// dinamicamente dentro do beforeAll (mesmo padrão dos testes de rota).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-db-migration-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

type Db = typeof import('./index')['db'];

/**
 * Migração de normalização de categoria (T-028): dados gravados antes da
 * normalização precisam ser reescritos na forma canônica, e o `initDb()` roda
 * a cada boot — a migração tem de ser idempotente.
 */
describe('initDb — migração de normalização de categorias', () => {
  let db: Db;
  let initDb: () => Promise<void>;
  let userA: number;
  let userB: number;

  beforeAll(async () => {
    const mod = await import('./index');
    db = mod.db;
    initDb = mod.initDb;

    // 1ª execução: cria o schema (sem dados legados ainda).
    await initDb();

    const insertUser = async (email: string) => {
      const res = await db.execute({
        sql: "INSERT INTO users (email, password_hash) VALUES (?, 'x')",
        args: [email],
      });
      return Number(res.lastInsertRowid ?? 0);
    };
    userA = await insertUser('migration-a@test.com');
    userB = await insertUser('migration-b@test.com');

    // Dados "legados": gravados direto no banco na forma NÃO normalizada,
    // simulando registros criados antes da T-028.
    for (const [category, amount] of [
      ['Mercado', 100],
      ['mercado ', 50],
      ['  MERCADO', 25],
      ['compras   do   mes', 10],
    ] as [string, number][]) {
      await db.execute({
        sql: 'INSERT INTO fixed_expenses (user_id, name, category, amount) VALUES (?, ?, ?, ?)',
        args: [userA, `Fixa ${category}`, category, amount],
      });
    }

    for (const [category, amount] of [
      ['Lazer', 30],
      ['LAZER', 20],
    ] as [string, number][]) {
      await db.execute({
        sql: 'INSERT INTO expense_entries (user_id, description, category, amount, date) VALUES (?, ?, ?, ?, ?)',
        args: [userA, `Gasto ${category}`, category, amount, '2026-07-10'],
      });
    }

    // Colisão no UNIQUE(user_id, category) de category_budgets: as duas
    // variações normalizam para "mercado" no mesmo usuário. O teto de maior id
    // (600, inserido depois) deve sobreviver.
    await db.execute({
      sql: 'INSERT INTO category_budgets (user_id, category, amount) VALUES (?, ?, ?)',
      args: [userA, 'Mercado', 500],
    });
    await db.execute({
      sql: 'INSERT INTO category_budgets (user_id, category, amount) VALUES (?, ?, ?)',
      args: [userA, 'mercado ', 600],
    });
    // Sem colisão: só precisa ser reescrito.
    await db.execute({
      sql: 'INSERT INTO category_budgets (user_id, category, amount) VALUES (?, ?, ?)',
      args: [userA, 'Lazer', 200],
    });
    // Mesma variação de caixa em OUTRO usuário não colide com a do userA.
    await db.execute({
      sql: 'INSERT INTO category_budgets (user_id, category, amount) VALUES (?, ?, ?)',
      args: [userB, 'MERCADO', 900],
    });

    // 2ª execução do initDb: é ela que migra os dados legados acima.
    await initDb();
  });

  it('normaliza a categoria das despesas fixas existentes', async () => {
    const res = await db.execute({
      sql: 'SELECT category, amount FROM fixed_expenses WHERE user_id = ? ORDER BY id',
      args: [userA],
    });
    expect(res.rows.map((r) => r.category)).toEqual([
      'mercado',
      'mercado',
      'mercado',
      'compras do mes',
    ]);
  });

  it('normaliza a categoria dos lançamentos variáveis existentes', async () => {
    const res = await db.execute({
      sql: 'SELECT DISTINCT category FROM expense_entries WHERE user_id = ?',
      args: [userA],
    });
    expect(res.rows.map((r) => r.category)).toEqual(['lazer']);
  });

  it('resolve a colisão de orçamentos mantendo o registro de maior id (mais recente)', async () => {
    const res = await db.execute({
      sql: 'SELECT category, amount FROM category_budgets WHERE user_id = ? ORDER BY category',
      args: [userA],
    });
    expect(res.rows.map((r) => ({ category: r.category, amount: r.amount }))).toEqual([
      { category: 'lazer', amount: 200 },
      { category: 'mercado', amount: 600 },
    ]);
  });

  it('não mistura orçamentos de usuários diferentes na resolução de colisão', async () => {
    const res = await db.execute({
      sql: 'SELECT category, amount FROM category_budgets WHERE user_id = ?',
      args: [userB],
    });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ category: 'mercado', amount: 900 });
  });

  it('roda de novo sem erro e sem alterar mais nada (idempotente)', async () => {
    const snapshot = async () => {
      const budgets = await db.execute(
        'SELECT id, user_id, category, amount FROM category_budgets ORDER BY id',
      );
      const fixed = await db.execute('SELECT id, category FROM fixed_expenses ORDER BY id');
      const entries = await db.execute('SELECT id, category FROM expense_entries ORDER BY id');
      return JSON.stringify([budgets.rows, fixed.rows, entries.rows]);
    };

    const before = await snapshot();
    await initDb();
    await initDb();
    expect(await snapshot()).toBe(before);
  });
});
