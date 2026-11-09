import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

/**
 * T-124a — o chão da assinatura recorrente no cartão: `billing_customers`,
 * `subscription_checkouts` e as colunas novas de `plans`/`subscriptions`.
 *
 * Banco temporário PRÓPRIO, e montado no schema ANTERIOR à T-124a antes do
 * primeiro `initDb()`: é o caminho que importa (o `wallet.db` de staging já
 * existe, com assinaturas Pix gravadas). `initDb()` opera sobre o client
 * singleton do processo, então esse caminho não caberia no `schema.test.ts`.
 */
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-db-card-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

type Mod = typeof import('./index');
type Db = Mod['db'];

const TABLES = ['plans', 'subscriptions', 'billing_customers', 'subscription_checkouts'] as const;

async function tableInfo(db: Db, table: string) {
  const res = await db.execute(`PRAGMA table_info(${table})`);
  return res.rows.map((row) => ({
    name: String(row.name),
    type: String(row.type),
    notnull: Number(row.notnull),
    dflt_value: row.dflt_value,
    pk: Number(row.pk),
  }));
}

async function column(db: Db, table: string, name: string) {
  return (await tableInfo(db, table)).find((c) => c.name === name);
}

async function indexSql(db: Db, name: string): Promise<string | null> {
  const res = await db.execute({
    sql: `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?`,
    args: [name],
  });
  return res.rows.length ? String(res.rows[0].sql) : null;
}

describe('initDb — assinatura no cartão (T-124a)', () => {
  let mod: Mod;
  let db: Db;
  let userA: number;
  let userB: number;
  let planId: number;
  const firstBoot: Record<string, unknown> = {};

  beforeAll(async () => {
    mod = await import('./index');
    db = mod.db;

    // Schema de billing ANTERIOR à T-124a, com uma assinatura Pix gravada.
    await db.execute(`CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await db.execute(`CREATE TABLE plans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL,
      interval    TEXT    NOT NULL CHECK(interval IN ('monthly', 'yearly')),
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )`);
    await db.execute(`CREATE TABLE subscriptions (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id            INTEGER NOT NULL REFERENCES users(id),
      plan_id            INTEGER NOT NULL REFERENCES plans(id),
      status             TEXT    NOT NULL DEFAULT 'pending'
                                 CHECK(status IN ('pending', 'active', 'expired', 'canceled')),
      current_period_end TEXT,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    )`);
    await db.execute(
      `INSERT INTO users (email, password_hash) VALUES ('legado@example.com', 'x'), ('outro@example.com', 'x')`
    );
    await db.execute(
      `INSERT INTO plans (code, name, price_cents, interval) VALUES ('legado_monthly', 'Legado', 990, 'monthly')`
    );
    await db.execute(
      `INSERT INTO subscriptions (user_id, plan_id, status, current_period_end)
       VALUES (1, 1, 'active', '2026-12-01 00:00:00')`
    );

    await mod.initDb();
    for (const table of TABLES) firstBoot[table] = await tableInfo(db, table);

    userA = 1;
    userB = 2;
    planId = 1;
  });

  it('initDb 2x: não falha e o PRAGMA table_info das tabelas é igual nas duas', async () => {
    await mod.initDb();
    for (const table of TABLES) {
      expect(await tableInfo(db, table)).toEqual(firstBoot[table]);
    }
  });

  it('banco antigo: a assinatura Pix gravada sobrevive, com as colunas novas em NULL', async () => {
    const res = await db.execute('SELECT * FROM subscriptions WHERE user_id = 1');
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0];
    expect(row.status).toBe('active');
    expect(row.current_period_end).toBe('2026-12-01 00:00:00');
    for (const c of [
      'provider',
      'abacate_subscription_id',
      'provider_status',
      'canceled_at',
      'last_synced_at',
    ]) {
      expect(row[c]).toBeNull();
    }
  });

  describe('plans', () => {
    it('ganha abacate_product_id TEXT e abacate_product_price_cents INTEGER, anuláveis e sem DEFAULT', async () => {
      for (const [name, type] of [
        ['abacate_product_id', 'TEXT'],
        ['abacate_product_price_cents', 'INTEGER'],
      ] as const) {
        const c = await column(db, 'plans', name);
        expect(c).toBeDefined();
        expect(c?.type).toBe(type);
        expect(c?.notnull).toBe(0);
        expect(c?.dflt_value).toBeNull();
      }
    });

    it('o plano legado continua com o produto em NULL', async () => {
      const res = await db.execute(
        `SELECT abacate_product_id AS p, abacate_product_price_cents AS c FROM plans WHERE id = 1`
      );
      expect(res.rows[0].p).toBeNull();
      expect(res.rows[0].c).toBeNull();
    });
  });

  describe('subscriptions', () => {
    it('ganha as cinco colunas TEXT anuláveis e sem DEFAULT', async () => {
      for (const name of [
        'provider',
        'abacate_subscription_id',
        'provider_status',
        'canceled_at',
        'last_synced_at',
      ]) {
        const c = await column(db, 'subscriptions', name);
        expect(c, name).toBeDefined();
        expect(c?.type).toBe('TEXT');
        expect(c?.notnull).toBe(0);
        expect(c?.dflt_value).toBeNull();
      }
    });

    it('o CHECK de status NÃO mudou (recriar a tabela seria destrutivo)', async () => {
      await expect(
        db.execute(
          `INSERT INTO subscriptions (user_id, plan_id, status) VALUES (${userB}, ${planId}, 'ACTIVE')`
        )
      ).rejects.toThrow();
    });

    it('abacate_subscription_id é único quando presente', async () => {
      expect(await indexSql(db, 'idx_subscriptions_abacate_id')).toContain(
        'WHERE abacate_subscription_id IS NOT NULL'
      );
      await db.execute(
        `UPDATE subscriptions SET abacate_subscription_id = 'subs_dup' WHERE user_id = ${userA}`
      );
      // idx_subscriptions_user já impede 2 linhas do mesmo usuário; a 2ª é de B.
      await expect(
        db.execute(
          `INSERT INTO subscriptions (user_id, plan_id, abacate_subscription_id)
           VALUES (${userB}, ${planId}, 'subs_dup')`
        )
      ).rejects.toThrow();
    });

    it('várias assinaturas Pix legadas (NULL) convivem', async () => {
      await db.execute(
        `UPDATE subscriptions SET abacate_subscription_id = NULL WHERE user_id = ${userA}`
      );
      await db.execute(`INSERT INTO subscriptions (user_id, plan_id) VALUES (${userB}, ${planId})`);
      const res = await db.execute(
        'SELECT COUNT(*) AS cnt FROM subscriptions WHERE abacate_subscription_id IS NULL'
      );
      expect(Number(res.rows[0].cnt)).toBe(2);
    });
  });

  describe('billing_customers', () => {
    it('tem as colunas do domínio', async () => {
      const cols = await tableInfo(db, 'billing_customers');
      expect(cols.map((c) => c.name)).toEqual([
        'id',
        'user_id',
        'abacate_customer_id',
        'created_at',
      ]);
      expect(cols.find((c) => c.name === 'user_id')?.notnull).toBe(1);
      expect(cols.find((c) => c.name === 'abacate_customer_id')?.notnull).toBe(1);
    });

    it('um cliente por usuário', async () => {
      await db.execute(
        `INSERT INTO billing_customers (user_id, abacate_customer_id) VALUES (${userA}, 'cust_a')`
      );
      await expect(
        db.execute(
          `INSERT INTO billing_customers (user_id, abacate_customer_id) VALUES (${userA}, 'cust_a2')`
        )
      ).rejects.toThrow();
    });

    it('um cliente do provedor pertence a um usuário só', async () => {
      await expect(
        db.execute(
          `INSERT INTO billing_customers (user_id, abacate_customer_id) VALUES (${userB}, 'cust_a')`
        )
      ).rejects.toThrow();
    });
  });

  describe('subscription_checkouts', () => {
    const insert = (status: string, checkoutId: string | null, user = userA) =>
      db.execute({
        sql: `INSERT INTO subscription_checkouts (user_id, plan_id, abacate_checkout_id, status)
              VALUES (?, ?, ?, ?)`,
        args: [user, planId, checkoutId, status],
      });

    it('tem as colunas do domínio, com os ids do provedor anuláveis', async () => {
      const cols = await tableInfo(db, 'subscription_checkouts');
      expect(cols.map((c) => c.name)).toEqual([
        'id',
        'user_id',
        'plan_id',
        'abacate_checkout_id',
        'checkout_url',
        'status',
        'abacate_subscription_id',
        'created_at',
        'completed_at',
      ]);
      for (const name of [
        'abacate_checkout_id',
        'checkout_url',
        'abacate_subscription_id',
        'completed_at',
      ]) {
        expect(cols.find((c) => c.name === name)?.notnull, name).toBe(0);
      }
    });

    it('o CHECK recusa status fora do vocabulário', async () => {
      await expect(insert('PAID', 'bill_x', userB)).rejects.toThrow();
    });

    it('2º checkout aberto (CREATING/OPEN) do mesmo usuário é recusado', async () => {
      await insert('OPEN', 'bill_open_a');
      await expect(insert('OPEN', 'bill_open_a2')).rejects.toThrow();
      await expect(insert('CREATING', null)).rejects.toThrow();
    });

    it('COMPLETED/SUPERSEDED/FAILED coexistem com o aberto e entre si', async () => {
      await insert('COMPLETED', 'bill_done_1');
      await insert('COMPLETED', 'bill_done_2');
      await insert('SUPERSEDED', 'bill_sup');
      await insert('FAILED', null);
      await insert('FAILED', null);
      const res = await db.execute(
        `SELECT COUNT(*) AS cnt FROM subscription_checkouts WHERE user_id = ${userA}`
      );
      expect(Number(res.rows[0].cnt)).toBe(6);
    });

    it('a trava é por usuário: outro usuário abre o seu', async () => {
      await expect(insert('CREATING', null, userB)).resolves.toBeDefined();
    });

    it('dois NULL em abacate_checkout_id não colidem', async () => {
      const res = await db.execute(
        'SELECT COUNT(*) AS cnt FROM subscription_checkouts WHERE abacate_checkout_id IS NULL'
      );
      expect(Number(res.rows[0].cnt)).toBeGreaterThanOrEqual(2);
    });

    it('abacate_checkout_id repetido é recusado', async () => {
      await expect(insert('FAILED', 'bill_done_1', userB)).rejects.toThrow();
    });

    it('os dois índices são parciais', async () => {
      expect(await indexSql(db, 'idx_subscription_checkouts_abacate_id')).toContain(
        'WHERE abacate_checkout_id IS NOT NULL'
      );
      expect(await indexSql(db, 'idx_subscription_checkouts_user_open')).toContain(
        "WHERE status IN ('CREATING', 'OPEN')"
      );
    });

    it('status nasce CREATING por default', async () => {
      await db.execute(`UPDATE subscription_checkouts SET status = 'FAILED' WHERE user_id = ${userB}`);
      const created = await db.execute(
        `INSERT INTO subscription_checkouts (user_id, plan_id) VALUES (${userB}, ${planId})`
      );
      const res = await db.execute({
        sql: 'SELECT status FROM subscription_checkouts WHERE id = ?',
        args: [Number(created.lastInsertRowid ?? 0)],
      });
      expect(res.rows[0].status).toBe('CREATING');
    });
  });
});
