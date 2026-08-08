import { describe, expect, it } from 'vitest';
import type { Plan, PixCharge, Subscription } from '@vetor-wallet/shared';
import {
  formatPlanPrice,
  planPeriodLabel,
  monthlyEquivalentCents,
  yearlySavingsPercent,
  qrCodeDataUrl,
  remainingSeconds,
  formatCountdown,
  chargeUiState,
  shouldKeepPolling,
  nextPollDelayMs,
  planBadge,
} from './planos';

const norm = (s: string) => s.replace(/ /g, ' ');

/** `expires_at`/`current_period_end` chegam no formato SQLite UTC ('YYYY-MM-DD HH:MM:SS'). */
function sqliteUtc(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '');
}

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

function makeCharge(overrides: Partial<PixCharge> = {}): PixCharge {
  return {
    id: 1,
    plan_id: 1,
    amount_cents: 990,
    status: 'PENDING',
    br_code: 'brcode',
    br_code_base64: 'AAAA',
    expires_at: null,
    created_at: '2026-08-01 00:00:00',
    ...overrides,
  };
}

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 1,
    plan_id: 1,
    status: 'active',
    current_period_end: null,
    created_at: '2026-08-01 00:00:00',
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

describe('qrCodeDataUrl', () => {
  it('aceita base64 sem prefixo', () => {
    expect(qrCodeDataUrl('AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('aceita base64 já prefixado', () => {
    expect(qrCodeDataUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });
});

describe('remainingSeconds', () => {
  it('calcula segundos futuros', () => {
    const now = Date.parse('2026-08-01T00:00:00Z');
    const expires = new Date(now + 90_000).toISOString();
    expect(remainingSeconds(expires, now)).toBe(90);
  });

  it('clampa para 0 quando já passou', () => {
    const now = Date.parse('2026-08-01T00:00:00Z');
    const expires = new Date(now - 90_000).toISOString();
    expect(remainingSeconds(expires, now)).toBe(0);
  });

  it('retorna null quando expiresAt é null', () => {
    expect(remainingSeconds(null, Date.now())).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('formata mm:ss', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(75)).toBe('01:15');
  });
});

describe('chargeUiState', () => {
  const now = Date.parse('2026-08-01T00:00:00Z');

  it('PAID', () => {
    expect(chargeUiState(makeCharge({ status: 'PAID' }), now)).toBe('paid');
  });

  it('PENDING com prazo válido', () => {
    const future = sqliteUtc(now + 60_000);
    expect(chargeUiState(makeCharge({ status: 'PENDING', expires_at: future }), now)).toBe(
      'awaiting'
    );
  });

  it('PENDING com expires_at no passado', () => {
    const past = sqliteUtc(now - 60_000);
    expect(chargeUiState(makeCharge({ status: 'PENDING', expires_at: past }), now)).toBe('expired');
  });

  it('EXPIRED', () => {
    expect(chargeUiState(makeCharge({ status: 'EXPIRED' }), now)).toBe('expired');
  });

  it('null (idle)', () => {
    expect(chargeUiState(null, now)).toBe('idle');
  });
});

describe('shouldKeepPolling', () => {
  it('só continua em awaiting', () => {
    expect(shouldKeepPolling('awaiting')).toBe(true);
    expect(shouldKeepPolling('paid')).toBe(false);
    expect(shouldKeepPolling('expired')).toBe(false);
    expect(shouldKeepPolling('error')).toBe(false);
    expect(shouldKeepPolling('idle')).toBe(false);
  });
});

describe('nextPollDelayMs', () => {
  it('cresce com teto de 15s', () => {
    expect(nextPollDelayMs(0)).toBe(3000);
    expect(nextPollDelayMs(1)).toBe(3000);
    expect(nextPollDelayMs(2)).toBe(5000);
    expect(nextPollDelayMs(3)).toBe(8000);
    expect(nextPollDelayMs(4)).toBe(15000);
    expect(nextPollDelayMs(100)).toBe(15000);
  });
});

describe('planBadge', () => {
  const now = Date.parse('2026-08-01T00:00:00Z');

  it('staging quando billing desligado, independente da assinatura', () => {
    expect(planBadge({ billingEnabled: false, subscription: makeSub() }, now)).toBe('staging');
  });

  it('none sem assinatura', () => {
    expect(planBadge({ billingEnabled: true, subscription: null }, now)).toBe('none');
  });

  it('pending', () => {
    expect(
      planBadge({ billingEnabled: true, subscription: makeSub({ status: 'pending' }) }, now)
    ).toBe('pending');
  });

  it('expired por status', () => {
    expect(
      planBadge({ billingEnabled: true, subscription: makeSub({ status: 'expired' }) }, now)
    ).toBe('expired');
  });

  it('active com período vigente', () => {
    const future = new Date(now + 86_400_000).toISOString();
    expect(
      planBadge(
        {
          billingEnabled: true,
          subscription: makeSub({ status: 'active', current_period_end: future }),
        },
        now
      )
    ).toBe('active');
  });
});
