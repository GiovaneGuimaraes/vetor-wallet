import { isSubscriptionActive } from 'src/isSubscriptionActive';

describe('isSubscriptionActive', () => {
  const now = '2026-08-01 00:00:00';

  test('active com período no futuro é ativa', () => {
    expect(
      isSubscriptionActive({ status: 'active', current_period_end: '2026-09-01 00:00:00' }, now)
    ).toBe(true);
  });

  test('active com período vencido NÃO é ativa', () => {
    expect(
      isSubscriptionActive({ status: 'active', current_period_end: '2026-07-31 23:59:59' }, now)
    ).toBe(false);
  });

  test('período terminando exatamente agora NÃO é ativa (comparação estrita)', () => {
    expect(isSubscriptionActive({ status: 'active', current_period_end: now }, now)).toBe(false);
  });

  test('canceled com período no FUTURO vale (acesso até o fim do período pago — T-124b1)', () => {
    expect(
      isSubscriptionActive({ status: 'canceled', current_period_end: '2026-09-01 00:00:00' }, now)
    ).toBe(true);
  });

  test('canceled com período vencido NÃO vale', () => {
    expect(
      isSubscriptionActive({ status: 'canceled', current_period_end: '2026-07-31 23:59:59' }, now)
    ).toBe(false);
  });

  test('canceled terminando exatamente agora NÃO vale', () => {
    expect(isSubscriptionActive({ status: 'canceled', current_period_end: now }, now)).toBe(false);
  });

  test('canceled sem current_period_end não vale', () => {
    expect(isSubscriptionActive({ status: 'canceled', current_period_end: null }, now)).toBe(false);
  });

  test.each(['pending', 'expired', 'ACTIVE', 'cancelled'])(
    '%s nunca é ativa, mesmo dentro do período',
    (status) => {
      expect(isSubscriptionActive({ status, current_period_end: '2026-09-01 00:00:00' }, now)).toBe(
        false
      );
    }
  );

  test('active sem current_period_end não é ativa', () => {
    expect(isSubscriptionActive({ status: 'active', current_period_end: null }, now)).toBe(false);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
  ])('ausência de assinatura (%s) não é ativa', (_label, sub) => {
    expect(isSubscriptionActive(sub, now)).toBe(false);
  });
});
