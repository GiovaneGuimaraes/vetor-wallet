import type { QueryConfig, QueryResult } from '@vetor-wallet/query';

import type { MockQuery } from './testQuery';

/**
 * Banco de mentira COM ESTADO para a regra do cartão (T-124b1).
 *
 * O `createTestQuery` responde o que o teste mandar; aqui é diferente: cada
 * instrução que a regra emite é reconhecida por trecho de SQL (nunca por ordem
 * de chamada) e aplicada a tabelas em memória com a MESMA semântica do SQLite
 * — `WHERE` condicional, `rowCount` real, `ON CONFLICT`, os índices únicos do
 * schema. É o que permite provar corrida: dois `Promise.all` intercalam as
 * instruções (cada uma cede o event loop antes e depois de executar), e cada
 * instrução é atômica, como no banco.
 *
 * SQL não reconhecido LANÇA — instrução nova na regra sem semântica aqui é
 * falha alta, não um `{ rows: [] }` silencioso que faria o teste mentir.
 * A semântica foi conferida contra SQLite real (script de evidência da T-124b1,
 * `initDb` + `createSqliteQuery`).
 */

export interface FakePlan {
  id: number;
  code: string;
  name: string;
  description: string;
  price_cents: number;
  interval: 'monthly' | 'yearly';
  active: number;
  abacate_product_id: string | null;
  abacate_product_price_cents: number | null;
}

export interface FakeSubscription {
  user_id: number;
  plan_id: number;
  status: string;
  current_period_end: string | null;
  provider: string | null;
  abacate_subscription_id: string | null;
  provider_status: string | null;
  canceled_at: string | null;
  last_synced_at: string | null;
  updated_at: string | null;
}

export interface FakeCheckout {
  id: number;
  user_id: number;
  plan_id: number;
  abacate_checkout_id: string | null;
  checkout_url: string | null;
  status: string;
  abacate_subscription_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface FakeCustomer {
  user_id: number;
  abacate_customer_id: string;
}

export interface FakeState {
  plans: FakePlan[];
  subscriptions: FakeSubscription[];
  checkouts: FakeCheckout[];
  customers: FakeCustomer[];
}

export const fakePlan = (over: Partial<FakePlan> = {}): FakePlan => {
  return {
    id: 1,
    code: 'pro_monthly',
    name: 'Pro Mensal',
    description: '',
    price_cents: 1990,
    interval: 'monthly',
    active: 1,
    abacate_product_id: null,
    abacate_product_price_cents: null,
    ...over,
  };
};

export const fakeSubscription = (over: Partial<FakeSubscription> = {}): FakeSubscription => {
  return {
    user_id: 7,
    plan_id: 1,
    status: 'pending',
    current_period_end: null,
    provider: null,
    abacate_subscription_id: null,
    provider_status: null,
    canceled_at: null,
    last_synced_at: null,
    updated_at: null,
    ...over,
  };
};

export const fakeCheckout = (over: Partial<FakeCheckout> = {}): FakeCheckout => {
  return {
    id: 1,
    user_id: 7,
    plan_id: 1,
    abacate_checkout_id: 'bill_1',
    checkout_url: 'https://pay.example.com/bill_1',
    status: 'OPEN',
    abacate_subscription_id: null,
    created_at: '2026-11-08 11:00:00',
    completed_at: null,
    ...over,
  };
};

const tick = () => {
  return new Promise<void>((resolve) => setImmediate(resolve));
};

const norm = (text: string): string => {
  return text.replace(/\s+/g, ' ').trim();
};

const ok = <Row>(rows: Row[], rowCount = rows.length): QueryResult<Row> => {
  return { rows, rowCount };
};

const uniqueError = (what: string) => {
  return Object.assign(new Error(`UNIQUE constraint failed: ${what}`), {
    code: 'SQLITE_CONSTRAINT_UNIQUE',
  });
};

export interface FakeBillingDb {
  query: MockQuery;
  state: FakeState;
  /** Instruções emitidas, normalizadas — alvo dos snapshots de SQL. */
  statements: () => string[];
}

export const createFakeBillingDb = (initial: Partial<FakeState> = {}): FakeBillingDb => {
  const state: FakeState = {
    plans: initial.plans ?? [fakePlan()],
    subscriptions: initial.subscriptions ?? [],
    checkouts: initial.checkouts ?? [],
    customers: initial.customers ?? [],
  };
  let nextCheckoutId = Math.max(0, ...state.checkouts.map((c) => c.id)) + 1;

  const subByUser = (userId: unknown) => state.subscriptions.find((s) => s.user_id === userId);
  const subBySubsId = (id: unknown) =>
    state.subscriptions.find((s) => s.abacate_subscription_id === id);
  const checkoutByBill = (bill: unknown) =>
    state.checkouts.find((c) => c.abacate_checkout_id === bill);

  const assertSubsIdUnique = (id: string | null, except: FakeSubscription) => {
    if (id && state.subscriptions.some((s) => s !== except && s.abacate_subscription_id === id)) {
      throw uniqueError('subscriptions.abacate_subscription_id');
    }
  };

  const exec = (sql: string, v: unknown[]): QueryResult<Record<string, unknown>> => {
    // ── billing_customers ──
    if (sql.startsWith('SELECT abacate_customer_id FROM billing_customers WHERE user_id = $1')) {
      const c = state.customers.find((x) => x.user_id === v[0]);
      return ok(c ? [{ abacate_customer_id: c.abacate_customer_id }] : []);
    }
    if (
      sql.startsWith('INSERT INTO billing_customers') &&
      sql.includes('ON CONFLICT(user_id) DO NOTHING')
    ) {
      if (state.customers.some((x) => x.user_id === v[0])) return ok([], 0);
      if (state.customers.some((x) => x.abacate_customer_id === v[1])) {
        throw uniqueError('billing_customers.abacate_customer_id');
      }
      state.customers.push({ user_id: v[0] as number, abacate_customer_id: v[1] as string });
      return ok([], 1);
    }

    // ── plans ──
    if (sql === 'SELECT * FROM plans WHERE id = $1') {
      const p = state.plans.find((x) => x.id === v[0]);
      return ok(p ? [{ ...p }] : []);
    }
    if (sql === 'SELECT id FROM plans WHERE abacate_product_id = $1') {
      const p = state.plans.find((x) => x.abacate_product_id === v[0]);
      return ok(p ? [{ id: p.id }] : []);
    }
    if (
      sql.startsWith(
        'UPDATE plans SET abacate_product_id = $1, abacate_product_price_cents = $2 WHERE id = $3 AND price_cents = $4'
      )
    ) {
      const p = state.plans.find((x) => x.id === v[2] && x.price_cents === v[3]);
      if (!p) return ok([], 0);
      p.abacate_product_id = v[0] as string;
      p.abacate_product_price_cents = v[1] as number;
      return ok([], 1);
    }

    // ── subscriptions: leituras ──
    if (
      sql ===
      'SELECT status, current_period_end, abacate_subscription_id FROM subscriptions WHERE user_id = $1'
    ) {
      const s = subByUser(v[0]);
      return ok(
        s
          ? [
              {
                status: s.status,
                current_period_end: s.current_period_end,
                abacate_subscription_id: s.abacate_subscription_id,
              },
            ]
          : []
      );
    }
    if (
      sql ===
      'SELECT user_id, plan_id, status, current_period_end FROM subscriptions WHERE abacate_subscription_id = $1'
    ) {
      const s = subBySubsId(v[0]);
      return ok(
        s
          ? [
              {
                user_id: s.user_id,
                plan_id: s.plan_id,
                status: s.status,
                current_period_end: s.current_period_end,
              },
            ]
          : []
      );
    }

    // ── subscriptions: UPSERT pending (startCardCheckout) ──
    if (
      sql.startsWith(
        'INSERT INTO subscriptions (user_id, plan_id, status, created_at, updated_at)'
      ) &&
      sql.includes("'pending'")
    ) {
      const [userId, planId, , updatedAt, now] = v as [number, number, string, string, string];
      const s = subByUser(userId);
      if (!s) {
        state.subscriptions.push(
          fakeSubscription({
            user_id: userId,
            plan_id: planId,
            status: 'pending',
            updated_at: updatedAt,
          })
        );
        return ok([], 1);
      }
      const periodOver = (s.current_period_end ?? '') <= now;
      const noLiveCard = s.abacate_subscription_id === null || s.status === 'canceled';
      if (!(periodOver && noLiveCard)) return ok([], 0);
      s.plan_id = planId;
      s.status = 'pending';
      s.updated_at = updatedAt;
      return ok([], 1);
    }

    // ── subscriptions: UPSERT otimista da ativação ──
    if (sql.startsWith('INSERT INTO subscriptions') && sql.includes("'abacatepay_card'")) {
      const [userId, planId, end, subsId, providerStatus, , updatedAt, expStatus, expEnd, expSubs] =
        v as [
          number,
          number,
          string,
          string,
          string | null,
          string,
          string,
          string,
          string,
          string,
        ];
      const s = subByUser(userId);
      if (!s) {
        const row = fakeSubscription({
          user_id: userId,
          plan_id: planId,
          status: 'active',
          current_period_end: end,
          provider: 'abacatepay_card',
          abacate_subscription_id: subsId,
          provider_status: providerStatus,
          updated_at: updatedAt,
        });
        assertSubsIdUnique(subsId, row);
        state.subscriptions.push(row);
        return ok([], 1);
      }
      if (
        s.status !== expStatus ||
        (s.current_period_end ?? '') !== expEnd ||
        (s.abacate_subscription_id ?? '') !== expSubs
      ) {
        return ok([], 0);
      }
      assertSubsIdUnique(subsId, s);
      Object.assign(s, {
        plan_id: planId,
        status: 'active',
        current_period_end: end,
        provider: 'abacatepay_card',
        abacate_subscription_id: subsId,
        provider_status: providerStatus,
        canceled_at: null,
        updated_at: updatedAt,
      });
      return ok([], 1);
    }

    // ── subscriptions: UPDATEs da porta e do throttling ──
    if (
      sql.startsWith(
        'UPDATE subscriptions SET current_period_end = $1, provider_status = $2, updated_at = $3'
      )
    ) {
      const [end, ps, now, subsId, oldEnd, limit] = v as string[];
      const s = subBySubsId(subsId);
      if (!s || s.status !== 'active' || s.current_period_end === null) return ok([], 0);
      if (s.current_period_end !== oldEnd || s.current_period_end > limit) return ok([], 0);
      Object.assign(s, { current_period_end: end, provider_status: ps, updated_at: now });
      return ok([], 1);
    }
    if (sql.startsWith("UPDATE subscriptions SET provider_status = 'PAYMENT_FAILED'")) {
      const s = subBySubsId(v[1]);
      if (!s || (s.provider_status ?? '') === 'PAYMENT_FAILED') return ok([], 0);
      Object.assign(s, { provider_status: 'PAYMENT_FAILED', updated_at: v[0] });
      return ok([], 1);
    }
    if (sql.startsWith("UPDATE subscriptions SET status = 'canceled'")) {
      const s = subBySubsId(v[3]);
      if (!s || s.status === 'canceled') return ok([], 0);
      Object.assign(s, {
        status: 'canceled',
        canceled_at: v[0],
        provider_status: v[1],
        updated_at: v[2],
      });
      return ok([], 1);
    }
    if (sql.startsWith('UPDATE subscriptions SET plan_id = $1, updated_at = $2')) {
      const s = subBySubsId(v[2]);
      if (!s || s.plan_id === v[3]) return ok([], 0);
      Object.assign(s, { plan_id: v[0], updated_at: v[1] });
      return ok([], 1);
    }
    if (sql.startsWith('UPDATE subscriptions SET last_synced_at = $1')) {
      const s = subByUser(v[1]);
      if (!s || (s.last_synced_at !== null && s.last_synced_at > (v[2] as string)))
        return ok([], 0);
      s.last_synced_at = v[0] as string;
      return ok([], 1);
    }

    // ── subscription_checkouts ──
    if (
      sql.startsWith(
        "UPDATE subscription_checkouts SET status = 'FAILED' WHERE user_id = $1 AND status = 'CREATING' AND created_at < $2"
      )
    ) {
      const hit = state.checkouts.filter(
        (c) => c.user_id === v[0] && c.status === 'CREATING' && c.created_at < (v[1] as string)
      );
      hit.forEach((c) => (c.status = 'FAILED'));
      return ok([], hit.length);
    }
    if (
      sql ===
      "SELECT id, plan_id, abacate_checkout_id, checkout_url FROM subscription_checkouts WHERE user_id = $1 AND status = 'OPEN'"
    ) {
      const c = state.checkouts.find((x) => x.user_id === v[0] && x.status === 'OPEN');
      return ok(
        c
          ? [
              {
                id: c.id,
                plan_id: c.plan_id,
                abacate_checkout_id: c.abacate_checkout_id,
                checkout_url: c.checkout_url,
              },
            ]
          : []
      );
    }
    if (
      sql ===
      "SELECT abacate_checkout_id FROM subscription_checkouts WHERE user_id = $1 AND status = 'OPEN'"
    ) {
      const c = state.checkouts.find((x) => x.user_id === v[0] && x.status === 'OPEN');
      return ok(c ? [{ abacate_checkout_id: c.abacate_checkout_id }] : []);
    }
    if (
      sql.startsWith(
        "UPDATE subscription_checkouts SET status = 'SUPERSEDED' WHERE id = $1 AND status = 'OPEN'"
      )
    ) {
      const c = state.checkouts.find((x) => x.id === v[0] && x.status === 'OPEN');
      if (!c) return ok([], 0);
      c.status = 'SUPERSEDED';
      return ok([], 1);
    }
    if (
      sql.startsWith('INSERT INTO subscription_checkouts') &&
      sql.includes('ON CONFLICT DO NOTHING RETURNING id')
    ) {
      const [userId, planId, createdAt] = v as [number, number, string];
      if (
        state.checkouts.some(
          (c) => c.user_id === userId && (c.status === 'CREATING' || c.status === 'OPEN')
        )
      ) {
        return ok([], 0);
      }
      const id = nextCheckoutId++;
      state.checkouts.push(
        fakeCheckout({
          id,
          user_id: userId,
          plan_id: planId,
          abacate_checkout_id: null,
          checkout_url: null,
          status: 'CREATING',
          created_at: createdAt,
        })
      );
      return ok([{ id }], 1);
    }
    if (
      sql.startsWith(
        "UPDATE subscription_checkouts SET status = 'FAILED' WHERE id = $1 AND status = 'CREATING'"
      )
    ) {
      const c = state.checkouts.find((x) => x.id === v[0] && x.status === 'CREATING');
      if (!c) return ok([], 0);
      c.status = 'FAILED';
      return ok([], 1);
    }
    if (sql.startsWith("UPDATE subscription_checkouts SET status = 'OPEN'")) {
      const c = state.checkouts.find((x) => x.id === v[2] && x.status === 'CREATING');
      if (!c) return ok([], 0);
      if (state.checkouts.some((x) => x !== c && x.abacate_checkout_id === v[0])) {
        throw uniqueError('subscription_checkouts.abacate_checkout_id');
      }
      Object.assign(c, { status: 'OPEN', abacate_checkout_id: v[0], checkout_url: v[1] });
      return ok([], 1);
    }
    if (sql.startsWith("UPDATE subscription_checkouts SET status = 'COMPLETED'")) {
      const c = checkoutByBill(v[2]);
      if (!c || c.status === 'COMPLETED') return ok([], 0);
      Object.assign(c, { status: 'COMPLETED', abacate_subscription_id: v[0], completed_at: v[1] });
      return ok([], 1);
    }
    if (
      sql === 'SELECT user_id, plan_id FROM subscription_checkouts WHERE abacate_checkout_id = $1'
    ) {
      const c = checkoutByBill(v[0]);
      return ok(c ? [{ user_id: c.user_id, plan_id: c.plan_id }] : []);
    }
    if (
      sql ===
      'SELECT abacate_subscription_id FROM subscription_checkouts WHERE abacate_checkout_id = $1'
    ) {
      const c = checkoutByBill(v[0]);
      return ok(c ? [{ abacate_subscription_id: c.abacate_subscription_id }] : []);
    }

    throw new Error(`fakeBillingDb: SQL não reconhecido: ${sql}`);
  };

  const query = jest.fn(async (config: QueryConfig | string) => {
    const { text, values } = typeof config === 'string' ? { text: config, values: [] } : config;
    await tick();
    const res = exec(norm(text), values ?? []);
    await tick();
    return res;
  }) as unknown as MockQuery;

  return {
    query,
    state,
    statements: () => query.mock.calls.map(([c]: [QueryConfig]) => norm(c.text)),
  };
};
