import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

/**
 * T-091b2 — etapa 2 (destrutiva) da remoção de Metas.
 *
 * O teste não pode partir do schema ATUAL: nele `goals`/`goal_id` já não existem,
 * e a migração seria um no-op. Então o banco temporário é montado **à mão no
 * schema antigo** (o que um `wallet.db` real tem hoje: `goals`, a coluna
 * `savings_entries.goal_id` com FK, o índice `idx_savings_entries_goal`) e só
 * depois `initDb()` roda — exatamente o caminho de um boot pós-deploy.
 *
 * A DDL de `savings_entries` abaixo é a original: `CREATE TABLE` sem `goal_id`
 * nem `transfer_group`, seguido dos dois `ALTER TABLE ADD COLUMN` — é assim que
 * as colunas entraram no banco real, e reproduzir isso importa porque é a FK do
 * `ADD COLUMN` que impede um `DROP COLUMN` simples.
 *
 * Valores monetários daqui são INVENTADOS (o repo é público).
 */
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-drop-goals-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

type Db = (typeof import('./index'))['db'];

/** Estado do ledger antes da migração, para comparar depois linha por linha. */
interface LedgerRow {
  id: number;
  user_id: number;
  type: string;
  amount: number;
  date: string;
  note: string;
  created_at: string;
  transfer_group: string | null;
}

describe('initDb — DROP de goals/goal_id num banco no schema antigo (T-091b2)', () => {
  let db: Db;
  let userId: number;
  let before: LedgerRow[];
  let balanceBefore: number;

  beforeAll(async () => {
    const client = await import('./client');
    db = client.db;

    // ── schema ANTIGO, montado à mão ─────────────────────────────────────────
    await db.execute(`
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`
      CREATE TABLE goals (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id        INTEGER NOT NULL REFERENCES users(id),
        name           TEXT    NOT NULL,
        target_amount  REAL    NOT NULL,
        current_amount REAL    NOT NULL DEFAULT 0,
        created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`
      CREATE TABLE savings_entries (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id),
        type       TEXT    NOT NULL CHECK(type IN ('DEPOSIT', 'WITHDRAW', 'YIELD')),
        amount     REAL    NOT NULL,
        date       TEXT    NOT NULL,
        note       TEXT    NOT NULL DEFAULT '',
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute('ALTER TABLE savings_entries ADD COLUMN goal_id INTEGER REFERENCES goals(id)');
    await db.execute('ALTER TABLE savings_entries ADD COLUMN transfer_group TEXT');
    await db.execute(`CREATE INDEX idx_savings_entries_goal ON savings_entries(user_id, goal_id)`);

    const user = await db.execute({
      sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      args: ['drop-goals@test.com', 'hash'],
    });
    userId = Number(user.lastInsertRowid ?? 0);

    const goal = await db.execute({
      sql: 'INSERT INTO goals (user_id, name, target_amount, current_amount) VALUES (?, ?, ?, ?)',
      args: [userId, 'Meta legada', 5000, 1200],
    });
    const goalId = Number(goal.lastInsertRowid ?? 0);

    // Lançamentos: dois vinculados à meta, um solto, e um par de transferência
    // legada (T-041) com `transfer_group` preenchido nas duas pernas.
    const rows: [string, number, string, string, number | null, string | null][] = [
      ['DEPOSIT', 800.55, '2026-01-05', 'aporte vinculado', goalId, null],
      ['DEPOSIT', 0.1, '2026-01-06', 'centavos vinculados', goalId, null],
      ['YIELD', 0.2, '2026-01-07', 'rendimento solto', null, null],
      ['WITHDRAW', 200.3, '2026-02-01', 'perna 1 do par', null, 'grp-legado-1'],
      ['DEPOSIT', 200.3, '2026-02-01', 'perna 2 do par', goalId, 'grp-legado-1'],
    ];
    for (const [type, amount, date, note, gid, group] of rows) {
      await db.execute({
        sql: `INSERT INTO savings_entries (user_id, type, amount, date, note, goal_id, transfer_group)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [userId, type, amount, date, note, gid, group],
      });
    }

    const snapshot = await db.execute(
      `SELECT id, user_id, type, amount, date, note, created_at, transfer_group
       FROM savings_entries ORDER BY id ASC`
    );
    before = snapshot.rows as unknown as LedgerRow[];
    balanceBefore = computeBalanceCents(before);

    // ── o boot pós-deploy ────────────────────────────────────────────────────
    const mod = await import('./schema');
    await mod.initDb();
  });

  /** Mesma conta do `savings-core`/`summary`: DEPOSIT + YIELD − WITHDRAW, em centavos. */
  function computeBalanceCents(rows: Pick<LedgerRow, 'type' | 'amount'>[]): number {
    let cents = 0;
    for (const row of rows) {
      const value = Math.round(Number(row.amount) * 100);
      if (row.type === 'WITHDRAW') cents -= value;
      else cents += value;
    }
    return cents;
  }

  it('remove a coluna savings_entries.goal_id', async () => {
    const info = await db.execute('PRAGMA table_info(savings_entries)');
    const names = info.rows.map((row) => String(row.name));
    expect(names).not.toContain('goal_id');
  });

  it('remove a tabela goals', async () => {
    const res = await db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'table' AND name = ?`,
      args: ['goals'],
    });
    expect(Number(res.rows[0].cnt)).toBe(0);
  });

  it('remove o índice idx_savings_entries_goal', async () => {
    const res = await db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'index' AND name = ?`,
      args: ['idx_savings_entries_goal'],
    });
    expect(Number(res.rows[0].cnt)).toBe(0);
  });

  it('não deixa a tabela intermediária do rebuild para trás', async () => {
    const res = await db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE name LIKE ?`,
      args: ['savings_entries_t091b2%'],
    });
    expect(Number(res.rows[0].cnt)).toBe(0);
  });

  it('preserva transfer_group (o selo ⇄ de par legado NÃO sai — T-041)', async () => {
    const info = await db.execute('PRAGMA table_info(savings_entries)');
    expect(info.rows.map((row) => String(row.name))).toContain('transfer_group');

    const pair = await db.execute({
      sql: 'SELECT COUNT(*) AS cnt FROM savings_entries WHERE transfer_group = ?',
      args: ['grp-legado-1'],
    });
    expect(Number(pair.rows[0].cnt)).toBe(2);
  });

  it('preserva TODOS os lançamentos, com os mesmos id/valores/notas', async () => {
    const after = await db.execute(
      `SELECT id, user_id, type, amount, date, note, created_at, transfer_group
       FROM savings_entries ORDER BY id ASC`
    );
    expect(after.rows).toHaveLength(before.length);
    expect(after.rows.map((row) => ({ ...row }))).toEqual(before.map((row) => ({ ...row })));
  });

  it('mantém o saldo da poupança com os mesmos números de antes', async () => {
    const rows = await db.execute({
      sql: 'SELECT type, amount FROM savings_entries WHERE user_id = ?',
      args: [userId],
    });
    expect(computeBalanceCents(rows.rows as unknown as LedgerRow[])).toBe(balanceBefore);
    // 800,55 + 0,10 + 0,20 − 200,30 + 200,30 = 800,85 (em centavos, sem drift).
    expect(balanceBefore).toBe(80085);
  });

  it('a coluna não volta depois de reiniciar o server (initDb de novo, 2x)', async () => {
    const mod = await import('./schema');
    await mod.initDb();
    await mod.initDb();

    const info = await db.execute('PRAGMA table_info(savings_entries)');
    expect(info.rows.map((row) => String(row.name))).not.toContain('goal_id');

    const leftovers = await db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE name IN (?, ?)`,
      args: ['goals', 'idx_savings_entries_goal'],
    });
    expect(Number(leftovers.rows[0].cnt)).toBe(0);

    // Idempotência de verdade: rodar de novo não pode ter mexido no ledger.
    const after = await db.execute(
      `SELECT id, user_id, type, amount, date, note, created_at, transfer_group
       FROM savings_entries ORDER BY id ASC`
    );
    expect(after.rows.map((row) => ({ ...row }))).toEqual(before.map((row) => ({ ...row })));
  });

  it('continua aceitando INSERT sem reusar id (AUTOINCREMENT preservado)', async () => {
    const maxBefore = Math.max(...before.map((row) => Number(row.id)));
    const inserted = await db.execute({
      sql: `INSERT INTO savings_entries (user_id, type, amount, date, note)
            VALUES (?, 'DEPOSIT', 10, '2026-03-01', 'pos-migracao')`,
      args: [userId],
    });
    expect(Number(inserted.lastInsertRowid ?? 0)).toBeGreaterThan(maxBefore);
  });
});

// O caminho do banco NOVO (criado já pelo schema atual, sem nada para dropar)
// é coberto em `schema.test.ts`: lá o `initDb()` roda sobre um arquivo vazio, e
// as asserções da T-091b2 conferem que `goals`/`goal_id`/o índice não nascem.
// `initDb()` opera no client singleton do processo, então não dá para exercitar
// os dois caminhos no mesmo arquivo de teste.
