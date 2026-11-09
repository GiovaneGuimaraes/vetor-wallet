import { describe, expect, it } from 'vitest';
import type { MySubscriptionResponse, Plan, Subscription } from '@vetor-wallet/shared';
import {
  canSubscribe,
  checkoutReturnParam,
  formatPlanPrice,
  hasPaidAccess,
  isLegacyPix,
  monthlyEquivalentCents,
  nextPollDelayMs,
  planBadge,
  planPeriodLabel,
  subscribeErrorMessage,
  subscriptionProviderLabel,
  subscriptionUiState,
  yearlySavingsPercent,
} from './planos';

const norm = (s: string) => s.replace(/ /g, ' ');

const NOW = Date.parse('2026-08-01T00:00:00Z');
/** `current_period_end` chega no formato SQLite UTC ('YYYY-MM-DD HH:MM:SS'). */
const FUTURE = '2026-09-01 00:00:00';
const PAST = '2026-07-01 00:00:00';

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 1,
    code: 'pro_monthly',
    name: 'Pro',
    description: '',
    price_cents: 990,
    interval: 'monthly',
    active: true,
    ...overrides,
  };
}

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 1,
    plan_id: 1,
    status: 'active',
    current_period_end: FUTURE,
    created_at: '2026-07-01 00:00:00',
    provider: 'abacatepay_card',
    provider_status: 'ACTIVE',
    canceled_at: null,
    ...overrides,
  };
}

function makeMe(overrides: Partial<MySubscriptionResponse> = {}): MySubscriptionResponse {
  return {
    billingEnabled: true,
    subscription: null,
    plan: null,
    pendingCheckout: null,
    confirming: false,
    ...overrides,
  };
}

describe('formatPlanPrice', () => {
  it('formata centavos em BRL', () => {
    expect(norm(formatPlanPrice(990))).toBe('R$ 9,90');
    expect(norm(formatPlanPrice(9900))).toBe('R$ 99,00');
  });
});

describe('yearlySavingsPercent', () => {
  it('calcula a economia do plano anual vs. 12x o mensal', () => {
    const monthly = makePlan({ interval: 'monthly', price_cents: 1990 });
    const yearly = makePlan({ interval: 'yearly', price_cents: 1990 * 12 * 0.8 });
    expect(yearlySavingsPercent(yearly, monthly)).toBe(20);
  });

  it('retorna null se o plano não for anual', () => {
    const monthly = makePlan({ interval: 'monthly', price_cents: 1990 });
    expect(yearlySavingsPercent(monthly, monthly)).toBeNull();
  });

  it('retorna null sem plano mensal para comparar', () => {
    const yearly = makePlan({ interval: 'yearly', price_cents: 19000 });
    expect(yearlySavingsPercent(yearly, undefined)).toBeNull();
  });

  it('retorna null se o mensal tiver preço zero ou negativo', () => {
    const monthly = makePlan({ interval: 'monthly', price_cents: 0 });
    const yearly = makePlan({ interval: 'yearly', price_cents: 19000 });
    expect(yearlySavingsPercent(yearly, monthly)).toBeNull();
  });

  it('não economiza (0%) quando o anual custa exatamente 12x o mensal', () => {
    const monthly = makePlan({ interval: 'monthly', price_cents: 1000 });
    const yearly = makePlan({ interval: 'yearly', price_cents: 12000 });
    expect(yearlySavingsPercent(yearly, monthly)).toBe(0);
  });
});

describe('planPeriodLabel', () => {
  it('mapeia interval para sufixo', () => {
    expect(planPeriodLabel('monthly')).toBe('/mês');
    expect(planPeriodLabel('yearly')).toBe('/ano');
  });
});

describe('monthlyEquivalentCents', () => {
  it('divide por 12 para plano anual', () => {
    expect(monthlyEquivalentCents(makePlan({ interval: 'yearly', price_cents: 9900 }))).toBe(825);
  });

  it('retorna o próprio preço para plano mensal', () => {
    expect(monthlyEquivalentCents(makePlan({ interval: 'monthly', price_cents: 990 }))).toBe(990);
  });
});

describe('nextPollDelayMs', () => {
  it('cresce com teto de 15s', () => {
    expect(nextPollDelayMs(-1)).toBe(3000);
    expect(nextPollDelayMs(0)).toBe(3000);
    expect(nextPollDelayMs(1)).toBe(3000);
    expect(nextPollDelayMs(2)).toBe(5000);
    expect(nextPollDelayMs(3)).toBe(8000);
    expect(nextPollDelayMs(4)).toBe(15000);
    expect(nextPollDelayMs(50)).toBe(15000);
  });
});

describe('checkoutReturnParam', () => {
  it.each([
    ['?checkout=completed', 'completed'],
    ['?checkout=returned', 'returned'],
    ['?x=1&checkout=completed', 'completed'],
    ['?checkout=outra', null],
    ['', null],
    ['?checkout=', null],
  ])('%s → %s', (search, expected) => {
    expect(checkoutReturnParam(search)).toBe(expected);
  });
});

describe('hasPaidAccess (espelha isSubscriptionActive do gate)', () => {
  it.each([
    ['active no período', makeSub(), true],
    ['active vencida', makeSub({ current_period_end: PAST }), false],
    ['active sem fim de período', makeSub({ current_period_end: null }), false],
    ['canceled com período no futuro', makeSub({ status: 'canceled' }), true],
    ['canceled vencida', makeSub({ status: 'canceled', current_period_end: PAST }), false],
    ['pending', makeSub({ status: 'pending' }), false],
    ['expired', makeSub({ status: 'expired' }), false],
    ['nula', null, false],
  ])('%s → %s', (_l, sub, expected) => {
    expect(hasPaidAccess(sub, NOW)).toBe(expected);
  });

  it('terminar exatamente agora já não vale (estrito, como o gate)', () => {
    expect(hasPaidAccess(makeSub({ current_period_end: '2026-08-01 00:00:00' }), NOW)).toBe(false);
  });

  it('aceita ISO com T/Z', () => {
    expect(hasPaidAccess(makeSub({ current_period_end: '2026-09-01T00:00:00Z' }), NOW)).toBe(true);
  });
});

describe('isLegacyPix', () => {
  it('provider nulo/ausente ou pix_legacy é Pix legado; cartão não', () => {
    expect(isLegacyPix(makeSub({ provider: null }))).toBe(true);
    expect(isLegacyPix(makeSub({ provider: undefined }))).toBe(true);
    expect(isLegacyPix(makeSub({ provider: 'pix_legacy' }))).toBe(true);
    expect(isLegacyPix(makeSub())).toBe(false);
  });
});

describe('subscriptionUiState', () => {
  it('staging: billing desligado e nada de assinatura', () => {
    expect(subscriptionUiState(makeMe({ billingEnabled: false }), NOW)).toBe('staging');
  });

  it('billing desligado com assinatura: mostra o estado real (testar o cartão em staging)', () => {
    expect(
      subscriptionUiState(makeMe({ billingEnabled: false, subscription: makeSub() }), NOW)
    ).toBe('active');
  });

  it('none sem assinatura', () => {
    expect(subscriptionUiState(makeMe(), NOW)).toBe('none');
  });

  it('confirming vence o resto', () => {
    expect(
      subscriptionUiState(
        makeMe({
          confirming: true,
          subscription: makeSub({ status: 'pending', current_period_end: null }),
        }),
        NOW
      )
    ).toBe('confirming');
  });

  it('active (cartão no período)', () => {
    expect(subscriptionUiState(makeMe({ subscription: makeSub() }), NOW)).toBe('active');
  });

  it('payment_failed: cartão recusado, ainda no período', () => {
    expect(
      subscriptionUiState(
        makeMe({ subscription: makeSub({ provider_status: 'PAYMENT_FAILED' }) }),
        NOW
      )
    ).toBe('payment_failed');
  });

  it('canceled com período no FUTURO → canceled_with_access (o gate libera)', () => {
    expect(
      subscriptionUiState(makeMe({ subscription: makeSub({ status: 'canceled' }) }), NOW)
    ).toBe('canceled_with_access');
  });

  it('canceled VENCIDA → expired (pode assinar de novo)', () => {
    expect(
      subscriptionUiState(
        makeMe({ subscription: makeSub({ status: 'canceled', current_period_end: PAST }) }),
        NOW
      )
    ).toBe('expired');
  });

  it('Pix legado no período → legacy_pix (não renova)', () => {
    expect(
      subscriptionUiState(
        makeMe({ subscription: makeSub({ provider: null, provider_status: null }) }),
        NOW
      )
    ).toBe('legacy_pix');
  });

  it('Pix legado vencido → expired', () => {
    expect(
      subscriptionUiState(
        makeMe({
          subscription: makeSub({ provider: null, status: 'expired', current_period_end: PAST }),
        }),
        NOW
      )
    ).toBe('expired');
  });

  it('pending com checkout aberto → pending_checkout', () => {
    expect(
      subscriptionUiState(
        makeMe({
          subscription: makeSub({ status: 'pending', current_period_end: null }),
          pendingCheckout: { url: 'https://pay.example.com/c/1', plan_id: 1, created_at: PAST },
        }),
        NOW
      )
    ).toBe('pending_checkout');
  });

  it('pending sem checkout e sem período anterior → none', () => {
    expect(
      subscriptionUiState(
        makeMe({ subscription: makeSub({ status: 'pending', current_period_end: null }) }),
        NOW
      )
    ).toBe('none');
  });

  it('pending sem checkout com período anterior vencido → expired', () => {
    expect(
      subscriptionUiState(
        makeMe({ subscription: makeSub({ status: 'pending', current_period_end: PAST }) }),
        NOW
      )
    ).toBe('expired');
  });
});

describe('canSubscribe', () => {
  it('só sem acesso pago', () => {
    expect(canSubscribe('none')).toBe(true);
    expect(canSubscribe('expired')).toBe(true);
    expect(canSubscribe('pending_checkout')).toBe(true);
    expect(canSubscribe('staging')).toBe(true);
    for (const s of [
      'active',
      'payment_failed',
      'canceled_with_access',
      'legacy_pix',
      'confirming',
    ] as const) {
      expect(canSubscribe(s)).toBe(false);
    }
  });
});

describe('planBadge', () => {
  it('none sem assinatura', () => {
    expect(planBadge(null, NOW)).toBe('none');
  });

  it('pending', () => {
    expect(planBadge(makeSub({ status: 'pending' }), NOW)).toBe('pending');
  });

  it('active no período; vencida → expired', () => {
    expect(planBadge(makeSub(), NOW)).toBe('active');
    expect(planBadge(makeSub({ current_period_end: PAST }), NOW)).toBe('expired');
  });

  it('expired por status', () => {
    expect(planBadge(makeSub({ status: 'expired' }), NOW)).toBe('expired');
  });

  it('canceled com período pago → canceled (não none); vencida → expired', () => {
    expect(planBadge(makeSub({ status: 'canceled' }), NOW)).toBe('canceled');
    expect(planBadge(makeSub({ status: 'canceled', current_period_end: PAST }), NOW)).toBe(
      'expired'
    );
  });
});

describe('subscriptionProviderLabel', () => {
  it('cartão renova; Pix legado não', () => {
    expect(subscriptionProviderLabel(makeSub())).toMatch(/Cartão/);
    expect(subscriptionProviderLabel(makeSub({ provider: null }))).toBe('Pix (não renova)');
  });
});

describe('subscribeErrorMessage', () => {
  it.each([
    ['ALREADY_SUBSCRIBED', /já tem uma assinatura/],
    ['CHECKOUT_IN_PROGRESS', /sendo iniciado/],
    ['ACTIVATION_PENDING', /confirmando/],
    ['BILLING_NOT_CONFIGURED', /não está configurado/],
    ['PAYMENT_PROVIDER_ERROR', /indisponível/],
  ])('%s', (code, re) => {
    expect(subscribeErrorMessage(code)).toMatch(re);
  });

  it('código desconhecido usa a mensagem do servidor, ou um texto padrão', () => {
    expect(subscribeErrorMessage('X', 'mensagem do servidor')).toBe('mensagem do servidor');
    expect(subscribeErrorMessage(undefined)).toBe('Falha ao assinar o plano');
  });
});
