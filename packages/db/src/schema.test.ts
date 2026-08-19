import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

// Banco temporário próprio por arquivo de teste. `import` estático de '../db'
// seria hoisted acima do set de DATABASE_URL, então o módulo db é importado
// dinamicamente dentro do beforeAll (mesmo padrão dos testes de rota).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-db-schema-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

type Db = (typeof import('./index'))['db'];

/**
 * T-064: índice em quote_snapshots(ticker, captured_at) para evitar full scan
 * na query do piso de data usada por /portfolio/history (T-063).
 */
describe('initDb — índice idx_snapshots_ticker_time', () => {
  let db: Db;

  beforeAll(async () => {
    const mod = await import('./index');
    db = mod.db;
    await mod.initDb();
  });

  it('cria o índice idx_snapshots_ticker_time em quote_snapshots(ticker, captured_at)', async () => {
    const res = await db.execute({
      sql: `SELECT name, tbl_name, sql FROM sqlite_master
            WHERE type = 'index' AND name = ?`,
      args: ['idx_snapshots_ticker_time'],
    });

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].tbl_name).toBe('quote_snapshots');
    expect(String(res.rows[0].sql)).toContain('ticker');
    expect(String(res.rows[0].sql)).toContain('captured_at');
  });

  it('roda de novo sem erro (idempotente)', async () => {
    const mod = await import('./index');
    await mod.initDb();
    await mod.initDb();

    const res = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM sqlite_master
            WHERE type = 'index' AND name = ?`,
      args: ['idx_snapshots_ticker_time'],
    });
    expect(Number(res.rows[0].cnt)).toBe(1);
  });
});

/**
 * T-084: coluna `external_id` + índice único PARCIAL por (user_id, external_id)
 * nas duas tabelas de lançamento — base da importação idempotente.
 */
describe('initDb — external_id em income_entries/expense_entries (T-084)', () => {
  let db: Db;

  beforeAll(async () => {
    const mod = await import('./index');
    db = mod.db;
    await mod.initDb();
  });

  for (const table of ['income_entries', 'expense_entries'] as const) {
    it(`cria a coluna external_id (TEXT, nullable) em ${table}`, async () => {
      const res = await db.execute(`PRAGMA table_info(${table})`);
      const column = res.rows.find((row) => String(row.name) === 'external_id');
      expect(column).toBeDefined();
      expect(String(column?.type).toUpperCase()).toBe('TEXT');
      // nullable por design: lançamento manual não tem id de origem.
      expect(Number(column?.notnull)).toBe(0);
    });
  }

  for (const [table, indexName] of [
    ['income_entries', 'idx_income_entries_user_external'],
    ['expense_entries', 'idx_expense_entries_user_external'],
  ] as const) {
    it(`cria o índice único parcial ${indexName}`, async () => {
      const res = await db.execute({
        sql: `SELECT name, tbl_name, sql FROM sqlite_master
              WHERE type = 'index' AND name = ?`,
        args: [indexName],
      });

      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].tbl_name).toBe(table);
      const sql = String(res.rows[0].sql);
      expect(sql).toContain('UNIQUE');
      expect(sql).toContain('user_id');
      expect(sql).toContain('external_id');
      expect(sql).toContain('WHERE external_id IS NOT NULL');
    });
  }

  it('roda de novo sem erro (ALTER idempotente + IF NOT EXISTS do índice)', async () => {
    const mod = await import('./index');
    await mod.initDb();
    await mod.initDb();

    const res = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM sqlite_master
            WHERE type = 'index' AND name IN (?, ?)`,
      args: ['idx_income_entries_user_external', 'idx_expense_entries_user_external'],
    });
    expect(Number(res.rows[0].cnt)).toBe(2);
  });

  it('o índice parcial deixa NULLs de fora (vários lançamentos manuais do mesmo usuário)', async () => {
    await db.execute({
      sql: `INSERT INTO users (email, password_hash) VALUES (?, ?)`,
      args: ['schema-external-id@test.com', 'hash'],
    });
    const user = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: ['schema-external-id@test.com'],
    });
    const userId = Number(user.rows[0].id);

    for (let i = 0; i < 3; i += 1) {
      await db.execute({
        sql: `INSERT INTO income_entries (user_id, description, amount, date, external_id)
              VALUES (?, ?, ?, ?, NULL)`,
        args: [userId, `manual ${i}`, 10, '2026-01-01'],
      });
    }

    const count = await db.execute({
      sql: 'SELECT COUNT(*) as cnt FROM income_entries WHERE user_id = ?',
      args: [userId],
    });
    expect(Number(count.rows[0].cnt)).toBe(3);
  });
});

/**
 * T-089a: `pluggy_items` — a conexão Open Finance passa a viver no banco, por
 * usuário, em vez de `PLUGGY_ITEM_ID` no `.env` do cli.
 */
describe('initDb — pluggy_items (T-089a)', () => {
  let db: Db;

  beforeAll(async () => {
    const mod = await import('./index');
    db = mod.db;
    await mod.initDb();
  });

  it('cria a tabela com as colunas do domínio', async () => {
    const res = await db.execute('PRAGMA table_info(pluggy_items)');
    const byName = new Map(res.rows.map((row) => [String(row.name), row]));

    for (const column of [
      'id',
      'user_id',
      'item_id',
      'connector_id',
      'connector_name',
      'status',
      'created_at',
      'updated_at',
    ]) {
      expect(byName.has(column)).toBe(true);
    }
    // user_id/item_id/status são obrigatórios; conector é opcional.
    expect(Number(byName.get('user_id')?.notnull)).toBe(1);
    expect(Number(byName.get('item_id')?.notnull)).toBe(1);
    expect(Number(byName.get('status')?.notnull)).toBe(1);
    expect(Number(byName.get('connector_id')?.notnull)).toBe(0);
    expect(Number(byName.get('connector_name')?.notnull)).toBe(0);
  });

  it('a unicidade de item_id é GLOBAL, não por (user_id, item_id)', async () => {
    const res = await db.execute({
      sql: `SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name = ?`,
      args: ['idx_pluggy_items_item'],
    });

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].tbl_name).toBe('pluggy_items');
    const sql = String(res.rows[0].sql);
    expect(sql).toContain('UNIQUE');
    expect(sql).toContain('item_id');
    // Se `user_id` entrasse no índice, dois usuários poderiam registrar o mesmo
    // item — e o `itemId` é credencial portadora, não um nome escolhido.
    expect(sql).not.toContain('user_id');
  });

  it('cria o índice de leitura por usuário', async () => {
    const res = await db.execute({
      sql: `SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name = ?`,
      args: ['idx_pluggy_items_user'],
    });
    expect(res.rows).toHaveLength(1);
    expect(String(res.rows[0].sql)).toContain('user_id');
  });

  it('o UNIQUE global recusa o mesmo item_id em dois usuários', async () => {
    const first = await db.execute({
      sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      args: ['pluggy-items-schema-a@test.com', 'hash'],
    });
    const second = await db.execute({
      sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      args: ['pluggy-items-schema-b@test.com', 'hash'],
    });

    // UUID INVENTADO — nenhum itemId real entra em arquivo versionado.
    const itemId = '6e3a1f7c-0000-4000-8000-cccccccccccc';
    await db.execute({
      sql: 'INSERT INTO pluggy_items (user_id, item_id) VALUES (?, ?)',
      args: [Number(first.lastInsertRowid ?? 0), itemId],
    });

    await expect(
      db.execute({
        sql: 'INSERT INTO pluggy_items (user_id, item_id) VALUES (?, ?)',
        args: [Number(second.lastInsertRowid ?? 0), itemId],
      })
    ).rejects.toThrow(/UNIQUE/i);
  });

  it('roda de novo sem erro (CREATE TABLE/INDEX IF NOT EXISTS)', async () => {
    const mod = await import('./index');
    await mod.initDb();
    await mod.initDb();

    const res = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM sqlite_master
            WHERE name IN (?, ?, ?)`,
      args: ['pluggy_items', 'idx_pluggy_items_item', 'idx_pluggy_items_user'],
    });
    expect(Number(res.rows[0].cnt)).toBe(3);
  });
});

/**
 * T-091b2 — etapa 2 (destrutiva) da remoção de Metas. Aqui é o caminho do banco
 * NOVO: nada a dropar, e nada de Metas pode nascer. O caminho do banco LEGADO
 * (com `goals`/`goal_id` já gravados, que a migração de rebuild precisa apagar)
 * vive em `dropGoalsSchema.test.ts` — `initDb()` opera sobre o client singleton
 * do processo, então os dois caminhos não caberiam no mesmo arquivo.
 */
describe('initDb — Metas não existe mais no schema (T-091b2)', () => {
  let db: Db;

  beforeAll(async () => {
    const mod = await import('./index');
    db = mod.db;
    await mod.initDb();
  });

  it('não cria a tabela goals', async () => {
    const res = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = ?`,
      args: ['goals'],
    });
    expect(Number(res.rows[0].cnt)).toBe(0);
  });

  it('não cria a coluna savings_entries.goal_id', async () => {
    const res = await db.execute('PRAGMA table_info(savings_entries)');
    expect(res.rows.map((row) => String(row.name))).not.toContain('goal_id');
  });

  it('não cria o índice idx_savings_entries_goal', async () => {
    const res = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'index' AND name = ?`,
      args: ['idx_savings_entries_goal'],
    });
    expect(Number(res.rows[0].cnt)).toBe(0);
  });

  it('mantém transfer_group, que NÃO saiu com Metas (T-041)', async () => {
    const res = await db.execute('PRAGMA table_info(savings_entries)');
    expect(res.rows.map((row) => String(row.name))).toContain('transfer_group');
  });

  it('nada de Metas volta depois de reiniciar o boot (initDb 2x)', async () => {
    const mod = await import('./index');
    await mod.initDb();
    await mod.initDb();

    const leftovers = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM sqlite_master WHERE name IN (?, ?)`,
      args: ['goals', 'idx_savings_entries_goal'],
    });
    expect(Number(leftovers.rows[0].cnt)).toBe(0);

    const columns = await db.execute('PRAGMA table_info(savings_entries)');
    expect(columns.rows.map((row) => String(row.name))).not.toContain('goal_id');
  });
});
