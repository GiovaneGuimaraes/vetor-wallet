import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import request from 'supertest';
import { createHmac } from 'crypto';
import { ABACATEPAY_WEBHOOK_PUBLIC_KEY } from '@vetor-wallet/subscription-core';
import { tmpdir } from 'os';
import path from 'path';

const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-webhooks-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

const SECRET = 'webhook-secret-1234';

/** Esquema legado (até a T-123): nosso segredo, hex. */
function sign(raw: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(Buffer.from(raw, 'utf8')).digest('hex');
}

/** Esquema da doc oficial (T-123): chave pública fixa da AbacatePay, base64. */
function signDoc(raw: string): string {
  return createHmac('sha256', ABACATEPAY_WEBHOOK_PUBLIC_KEY)
    .update(Buffer.from(raw, 'utf8'))
    .digest('base64');
}

/** Linhas `webhook.signature` emitidas pelo logger (T-122) durante `fn`. */
async function captureSignatureLogs(fn: () => Promise<unknown>) {
  const lines: string[] = [];
  // O logger manda `info` e `warn` para console.log (só `error` vai ao stderr).
  const logSpy = vi.spyOn(console, 'log').mockImplementation((l) => void lines.push(String(l)));
  try {
    await fn();
  } finally {
    logSpy.mockRestore();
  }
  return lines
    .filter((l) => l.includes('"webhook.signature"'))
    .map((l) => ({ raw: l, parsed: JSON.parse(l) as Record<string, unknown> }));
}

describe('abacatepay webhook route', () => {
  let app: Express;
  let db: typeof import('@vetor-wallet/db').db;
  let userId: number;
  let planId: number;
  let yearlyPlanId: number;

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    const { default: webhooksRouter } = await import('./webhooks');
    const { errorHandler } = await import('../middleware/errorHandler');

    db = dbModule.db;
    await dbModule.initDb();

    app = express();
    // Espelha api/index.ts: o webhook é montado ANTES do express.json() global,
    // senão o raw body (base do HMAC) já teria sido consumido.
    app.use('/api/webhooks', webhooksRouter);
    app.use(express.json());
    app.use(errorHandler);

    await db.execute({
      sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      args: ['webhook@test.com', 'hash'],
    });
    userId = Number(
      (await db.execute("SELECT id FROM users WHERE email = 'webhook@test.com'")).rows[0].id
    );
    planId = Number(
      (await db.execute("SELECT id FROM plans WHERE code = 'pro_monthly'")).rows[0].id
    );
    yearlyPlanId = Number(
      (await db.execute("SELECT id FROM plans WHERE code = 'pro_yearly'")).rows[0].id
    );
  });

  let seq = 0;
  async function seedCharge(chargePlanId = planId) {
    seq += 1;
    const abacateId = `wh_prov_${seq}`;
    await db.execute({
      sql: `INSERT INTO pix_charges
              (user_id, plan_id, abacate_charge_id, amount_cents, status, br_code, br_code_base64, expires_at)
            VALUES (?, ?, ?, 990, 'PENDING', 'br', 'b64', '2099-01-01 00:00:00')`,
      args: [userId, chargePlanId, abacateId],
    });
    return abacateId;
  }

  function post(raw: string, opts: { secret?: string; signature?: string | null } = {}) {
    const query = opts.secret === undefined ? SECRET : opts.secret;
    let req = request(app)
      .post(`/api/webhooks/abacatepay?webhookSecret=${encodeURIComponent(query)}`)
      .set('Content-Type', 'application/json');
    if (opts.signature !== null) {
      req = req.set('x-webhook-signature', opts.signature ?? sign(raw));
    }
    // `.send(objeto)` reserializaria o corpo e invalidaria o HMAC — a string
    // enviada tem que ser exatamente a que foi assinada.
    return req.send(raw);
  }

  beforeEach(async () => {
    process.env.ABACATEPAY_WEBHOOK_SECRET = SECRET;
    await db.execute('DELETE FROM pix_charges');
    await db.execute('DELETE FROM subscriptions');
    await db.execute('DELETE FROM billing_webhook_events');
  });

  it('activates the subscription and records the event (no cookie needed)', async () => {
    const abacateId = await seedCharge();
    const raw = JSON.stringify({
      id: 'evt_1',
      event: 'transparent.completed',
      data: { id: abacateId },
    });

    const res = await post(raw);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, activated: true });

    const sub = await db.execute({
      sql: 'SELECT status, current_period_end FROM subscriptions WHERE user_id = ?',
      args: [userId],
    });
    expect(String(sub.rows[0].status)).toBe('active');
    expect(String(sub.rows[0].current_period_end)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    const charge = await db.execute({
      sql: 'SELECT status, paid_at FROM pix_charges WHERE abacate_charge_id = ?',
      args: [abacateId],
    });
    expect(String(charge.rows[0].status)).toBe('PAID');
    expect(charge.rows[0].paid_at).toBeTruthy();

    const events = await db.execute('SELECT event_id, event_type FROM billing_webhook_events');
    expect(events.rows).toHaveLength(1);
    expect(String(events.rows[0].event_id)).toBe('evt_1');
  });

  it('checkout.completed also activates', async () => {
    const abacateId = await seedCharge();
    const raw = JSON.stringify({
      id: 'evt_checkout',
      event: 'checkout.completed',
      data: { pixQrCode: { id: abacateId } },
    });

    const res = await post(raw);
    expect(res.body.activated).toBe(true);
    const sub = await db.execute({
      sql: 'SELECT status FROM subscriptions WHERE user_id = ?',
      args: [userId],
    });
    expect(String(sub.rows[0].status)).toBe('active');
  });

  it('replaying the same event_id is a no-op (period never doubles)', async () => {
    const abacateId = await seedCharge(yearlyPlanId);
    const raw = JSON.stringify({
      id: 'evt_replay',
      event: 'transparent.completed',
      data: { id: abacateId },
    });

    await post(raw);
    const first = await db.execute({
      sql: 'SELECT current_period_end FROM subscriptions WHERE user_id = ?',
      args: [userId],
    });

    const replay = await post(raw);
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);

    const second = await db.execute({
      sql: 'SELECT current_period_end FROM subscriptions WHERE user_id = ?',
      args: [userId],
    });
    expect(String(second.rows[0].current_period_end)).toBe(
      String(first.rows[0].current_period_end)
    );
    expect((await db.execute('SELECT * FROM billing_webhook_events')).rows).toHaveLength(1);
  });

  it('returns 401 with a wrong query secret and changes nothing', async () => {
    const abacateId = await seedCharge();
    const raw = JSON.stringify({
      id: 'evt_bad_secret',
      event: 'transparent.completed',
      data: { id: abacateId },
    });

    const res = await post(raw, { secret: 'nope' });
    expect(res.status).toBe(401);
    const charge = await db.execute({
      sql: 'SELECT status FROM pix_charges WHERE abacate_charge_id = ?',
      args: [abacateId],
    });
    expect(String(charge.rows[0].status)).toBe('PENDING');
    expect((await db.execute('SELECT * FROM subscriptions')).rows).toHaveLength(0);
  });

  it('returns 401 when the signature header is missing', async () => {
    const abacateId = await seedCharge();
    const raw = JSON.stringify({
      id: 'evt_no_sig',
      event: 'transparent.completed',
      data: { id: abacateId },
    });

    const res = await post(raw, { signature: null });
    expect(res.status).toBe(401);
    expect((await db.execute('SELECT * FROM subscriptions')).rows).toHaveLength(0);
  });

  it('returns 401 when the signature is wrong in both schemes', async () => {
    const abacateId = await seedCharge();
    const raw = JSON.stringify({
      id: 'evt_wrong_sig',
      event: 'transparent.completed',
      data: { id: abacateId },
    });

    const res = await post(raw, { signature: sign(raw, 'outro-segredo') });
    expect(res.status).toBe(401);
  });

  it('accepts the sha256= prefix on the signature header', async () => {
    const abacateId = await seedCharge();
    const raw = JSON.stringify({
      id: 'evt_prefixed',
      event: 'transparent.completed',
      data: { id: abacateId },
    });

    const res = await post(raw, { signature: `sha256=${sign(raw)}` });
    expect(res.status).toBe(200);
    expect(res.body.activated).toBe(true);
  });

  describe('assinatura conforme a doc da AbacatePay (T-123)', () => {
    it('processa um evento assinado com a chave pública (base64) e loga o esquema', async () => {
      const abacateId = await seedCharge();
      const raw = JSON.stringify({
        id: 'evt_doc_scheme',
        event: 'transparent.completed',
        data: { id: abacateId },
      });

      let res!: request.Response;
      const logs = await captureSignatureLogs(async () => {
        res = await post(raw, { signature: signDoc(raw) });
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, activated: true });
      expect(logs).toHaveLength(1);
      expect(logs[0].parsed).toMatchObject({
        level: 'info',
        event: 'webhook.signature',
        scheme: 'abacatepay-public-key',
        matched: true,
        headerPresent: true,
      });
      // Nunca a assinatura, o corpo, o segredo ou a chave.
      expect(logs[0].raw).not.toContain(signDoc(raw));
      expect(logs[0].raw).not.toContain(SECRET);
      expect(logs[0].raw).not.toContain(ABACATEPAY_WEBHOOK_PUBLIC_KEY.slice(0, 12));
      expect(logs[0].raw).not.toContain(abacateId);
      expect(logs[0].parsed).not.toHaveProperty('redacted');
    });

    it('processa pelo fallback legado e loga scheme legacy-secret', async () => {
      const abacateId = await seedCharge();
      const raw = JSON.stringify({
        id: 'evt_legacy_scheme',
        event: 'transparent.completed',
        data: { id: abacateId },
      });

      let res!: request.Response;
      const logs = await captureSignatureLogs(async () => {
        res = await post(raw);
      });
      expect(res.status).toBe(200);
      expect(res.body.activated).toBe(true);
      expect(logs.map((l) => l.parsed)).toEqual([
        expect.objectContaining({ scheme: 'legacy-secret', matched: true }),
      ]);
      expect(logs[0].raw).not.toContain(sign(raw));
    });

    it('header ausente → 401 e loga scheme none sem header', async () => {
      const raw = JSON.stringify({ id: 'evt_none', event: 'transparent.completed', data: {} });
      let res!: request.Response;
      const logs = await captureSignatureLogs(async () => {
        res = await post(raw, { signature: null });
      });
      expect(res.status).toBe(401);
      expect(logs.map((l) => l.parsed)).toEqual([
        expect.objectContaining({
          level: 'warn',
          scheme: 'none',
          matched: false,
          headerPresent: false,
        }),
      ]);
    });

    it('corpo adulterado com a assinatura (doc) de outro corpo → 401 e nada muda', async () => {
      const abacateId = await seedCharge();
      const original = JSON.stringify({
        id: 'evt_orig',
        event: 'billing.paid',
        data: { id: 'outra-cobranca' },
      });
      const tampered = JSON.stringify({
        id: 'evt_tampered',
        event: 'transparent.completed',
        data: { id: abacateId },
      });

      let res!: request.Response;
      const logs = await captureSignatureLogs(async () => {
        res = await post(tampered, { signature: signDoc(original) });
      });
      expect(res.status).toBe(401);
      expect(logs.map((l) => l.parsed)).toEqual([
        expect.objectContaining({ scheme: 'none', matched: false, headerPresent: true }),
      ]);
      expect((await db.execute('SELECT * FROM subscriptions')).rows).toHaveLength(0);
      expect((await db.execute('SELECT * FROM billing_webhook_events')).rows).toHaveLength(0);
    });

    it('corpo adulterado com a assinatura (legado) de outro corpo → 401', async () => {
      const abacateId = await seedCharge();
      const original = JSON.stringify({ id: 'evt_o', event: 'billing.paid', data: {} });
      const tampered = JSON.stringify({
        id: 'evt_t',
        event: 'transparent.completed',
        data: { id: abacateId },
      });
      const res = await post(tampered, { signature: sign(original) });
      expect(res.status).toBe(401);
      expect((await db.execute('SELECT * FROM subscriptions')).rows).toHaveLength(0);
    });

    it('assinatura da doc certa NÃO dispensa o ?webhookSecret= (prova de origem)', async () => {
      const abacateId = await seedCharge();
      const raw = JSON.stringify({
        id: 'evt_doc_no_secret',
        event: 'transparent.completed',
        data: { id: abacateId },
      });
      const res = await post(raw, { secret: 'nope', signature: signDoc(raw) });
      expect(res.status).toBe(401);
      expect((await db.execute('SELECT * FROM subscriptions')).rows).toHaveLength(0);
    });

    it('fail-closed sem segredo no env vale também para a assinatura da doc', async () => {
      delete process.env.ABACATEPAY_WEBHOOK_SECRET;
      const abacateId = await seedCharge();
      const raw = JSON.stringify({
        id: 'evt_doc_no_env',
        event: 'transparent.completed',
        data: { id: abacateId },
      });
      const res = await post(raw, { signature: signDoc(raw) });
      expect(res.status).toBe(401);
      expect((await db.execute('SELECT * FROM subscriptions')).rows).toHaveLength(0);
    });
  });

  it('returns 401 (fail-closed) when the secret is not configured in the env', async () => {
    delete process.env.ABACATEPAY_WEBHOOK_SECRET;
    const abacateId = await seedCharge();
    const raw = JSON.stringify({
      id: 'evt_no_env',
      event: 'transparent.completed',
      data: { id: abacateId },
    });

    const res = await post(raw);
    expect(res.status).toBe(401);
    expect((await db.execute('SELECT * FROM subscriptions')).rows).toHaveLength(0);
  });

  it('returns 200 ignored for an event we do not handle (2xx avoids endless retries)', async () => {
    const raw = JSON.stringify({ id: 'evt_other', event: 'billing.paid', data: { id: 'x' } });
    const res = await post(raw);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, ignored: true });
    expect((await db.execute('SELECT * FROM billing_webhook_events')).rows).toHaveLength(0);
  });

  it('returns 400 for an invalid JSON body', async () => {
    const raw = '{nao-e-json';
    const res = await post(raw);
    expect(res.status).toBe(400);
  });

  it('returns 200 unknownCharge for a charge we do not know', async () => {
    const raw = JSON.stringify({
      id: 'evt_unknown',
      event: 'transparent.completed',
      data: { id: 'prov_inexistente' },
    });
    const res = await post(raw);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, unknownCharge: true });
    expect((await db.execute('SELECT * FROM subscriptions')).rows).toHaveLength(0);
  });

  it('renewing before expiry adds to the current period end, and metadata.userId is ignored', async () => {
    const otherUserEmail = `wh-other-${Date.now()}@test.com`;
    await db.execute({
      sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      args: [otherUserEmail, 'hash'],
    });
    const otherUserId = Number(
      (await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [otherUserEmail] }))
        .rows[0].id
    );

    await db.execute({
      sql: `INSERT INTO subscriptions (user_id, plan_id, status, current_period_end)
            VALUES (?, ?, 'active', '2099-01-15 00:00:00')`,
      args: [userId, planId],
    });

    const abacateId = await seedCharge();
    const raw = JSON.stringify({
      id: 'evt_renew',
      event: 'transparent.completed',
      // metadata mentindo sobre o dono: o efeito tem que cair no user_id da
      // cobrança, nunca neste campo.
      data: { id: abacateId, metadata: { userId: otherUserId } },
    });

    const res = await post(raw);
    expect(res.body.activated).toBe(true);

    const sub = await db.execute({
      sql: 'SELECT current_period_end FROM subscriptions WHERE user_id = ?',
      args: [userId],
    });
    expect(String(sub.rows[0].current_period_end)).toBe('2099-02-15 00:00:00');
    expect(
      (
        await db.execute({
          sql: 'SELECT * FROM subscriptions WHERE user_id = ?',
          args: [otherUserId],
        })
      ).rows
    ).toHaveLength(0);
  });
});
