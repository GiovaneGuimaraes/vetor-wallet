import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

// Banco temporário próprio deste arquivo. `DATABASE_URL` precisa estar setado
// ANTES do import de '../db' (o client lê o env no top-level do módulo), então
// o módulo é importado dinamicamente dentro do beforeAll.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-billing-seed-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('billing schema + plans seed', () => {
  let db: Awaited<typeof import('./client')>['db'];
  let initDb: Awaited<typeof import('./schema')>['initDb'];

  beforeAll(async () => {
    const mod = await import('./index');
    db = mod.db;
    initDb = mod.initDb;
    await initDb();
  });

  it('seeds exactly the two default plans, with prices in cents', async () => {
    const res = await db.execute(
      'SELECT code, name, description, price_cents, interval, active FROM plans ORDER BY code ASC',
    );

    expect(res.rows.length).toBe(2);
    expect(res.rows.map((r) => r.code)).toEqual(['pro_monthly', 'pro_yearly']);

    const monthly = res.rows[0];
    expect(monthly.name).toBe('Pro Mensal');
    expect(Number(monthly.price_cents)).toBe(990);
    expect(monthly.interval).toBe('monthly');
    expect(Number(monthly.active)).toBe(1);
    expect(String(monthly.description).length).toBeGreaterThan(0);

    const yearly = res.rows[1];
    expect(yearly.name).toBe('Pro Anual');
    expect(Number(yearly.price_cents)).toBe(9900);
    expect(yearly.interval).toBe('yearly');
  });

  it('is idempotent: a second initDb does not duplicate plans nor change their ids', async () => {
    const before = await db.execute('SELECT id, code FROM plans ORDER BY id ASC');

    await initDb();
    await initDb();

    const after = await db.execute('SELECT id, code FROM plans ORDER BY id ASC');
    expect(after.rows.length).toBe(2);
    expect(after.rows.map((r) => [Number(r.id), r.code])).toEqual(
      before.rows.map((r) => [Number(r.id), r.code]),
    );
  });

  it('never overwrites a price edited by hand (seed only inserts)', async () => {
    await db.execute("UPDATE plans SET price_cents = 1290 WHERE code = 'pro_monthly'");

    await initDb();

    const res = await db.execute("SELECT price_cents FROM plans WHERE code = 'pro_monthly'");
    expect(Number(res.rows[0].price_cents)).toBe(1290);

    // Restaura para não interferir nos casos seguintes.
    await db.execute("UPDATE plans SET price_cents = 990 WHERE code = 'pro_monthly'");
  });

  it('rejects an invalid interval and a duplicated plan code', async () => {
    await expect(
      db.execute(
        `INSERT INTO plans (code, name, price_cents, interval) VALUES ('weird', 'X', 100, 'weekly')`,
      ),
    ).rejects.toThrow();

    await expect(
      db.execute(
        `INSERT INTO plans (code, name, price_cents, interval) VALUES ('pro_monthly', 'Clone', 100, 'monthly')`,
      ),
    ).rejects.toThrow();
  });

  it('allows one subscription per user and rejects a second one, plus duplicated abacate charge ids', async () => {
    await db.execute({
      sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      args: ['billing-seed@test.com', 'hash'],
    });
    const userRes = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: ['billing-seed@test.com'],
    });
    const userId = Number(userRes.rows[0].id);

    const planRes = await db.execute("SELECT id FROM plans WHERE code = 'pro_monthly'");
    const planId = Number(planRes.rows[0].id);

    await db.execute({
      sql: 'INSERT INTO subscriptions (user_id, plan_id) VALUES (?, ?)',
      args: [userId, planId],
    });

    // UNIQUE(user_id): trocar de plano é UPDATE, nunca uma segunda linha.
    await expect(
      db.execute({
        sql: 'INSERT INTO subscriptions (user_id, plan_id) VALUES (?, ?)',
        args: [userId, planId],
      }),
    ).rejects.toThrow();

    const sub = await db.execute({
      sql: 'SELECT status FROM subscriptions WHERE user_id = ?',
      args: [userId],
    });
    expect(sub.rows.length).toBe(1);
    expect(sub.rows[0].status).toBe('pending');

    await db.execute({
      sql: `INSERT INTO pix_charges (user_id, plan_id, abacate_charge_id, amount_cents)
            VALUES (?, ?, ?, ?)`,
      args: [userId, planId, 'pix_char_dup', 990],
    });

    await expect(
      db.execute({
        sql: `INSERT INTO pix_charges (user_id, plan_id, abacate_charge_id, amount_cents)
              VALUES (?, ?, ?, ?)`,
        args: [userId, planId, 'pix_char_dup', 990],
      }),
    ).rejects.toThrow();

    const charge = await db.execute({
      sql: 'SELECT status FROM pix_charges WHERE abacate_charge_id = ?',
      args: ['pix_char_dup'],
    });
    expect(charge.rows.length).toBe(1);
    expect(charge.rows[0].status).toBe('PENDING');
  });

  it('rejects a duplicated webhook event id (idempotency key used by T-070)', async () => {
    await db.execute({
      sql: 'INSERT INTO billing_webhook_events (event_id, event_type) VALUES (?, ?)',
      args: ['evt_1', 'billing.paid'],
    });

    await expect(
      db.execute({
        sql: 'INSERT INTO billing_webhook_events (event_id, event_type) VALUES (?, ?)',
        args: ['evt_1', 'billing.paid'],
      }),
    ).rejects.toThrow();
  });
});
