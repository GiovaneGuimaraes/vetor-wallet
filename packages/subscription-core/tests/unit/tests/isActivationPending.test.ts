import { isActivationPending } from 'src/isActivationPending';

const checkout = (over = {}) => {
  return { abacate_subscription_id: 'subs_9', completed_at: '2026-11-08 11:30:00', ...over };
};
const sub = (over = {}) => {
  return {
    status: 'pending',
    abacate_subscription_id: null as string | null,
    updated_at: '2026-11-08 11:00:00' as string | null,
    ...over,
  };
};

describe('isActivationPending', () => {
  test('checkout pago depois do pending, linha sem esse subs_ → pendente', () => {
    expect(isActivationPending(checkout(), sub())).toBe(true);
  });

  test('concluído no MESMO instante do pending ainda conta (>=)', () => {
    expect(isActivationPending(checkout({ completed_at: '2026-11-08 11:00:00' }), sub())).toBe(
      true
    );
  });

  test('linha pending com subs_ ANTIGO (cancelada de antes) e checkout novo → pendente', () => {
    expect(isActivationPending(checkout(), sub({ abacate_subscription_id: 'subs_old' }))).toBe(
      true
    );
  });

  test('linha sem updated_at → pendente (nada prova que é histórico)', () => {
    expect(isActivationPending(checkout(), sub({ updated_at: null }))).toBe(true);
  });

  test('formatos ISO e SQLite comparam pelo instante, não pelo texto', () => {
    expect(
      isActivationPending(
        checkout({ completed_at: '2026-11-08T11:30:00.000Z' }),
        sub({ updated_at: '2026-11-08 11:30:00' })
      )
    ).toBe(true);
  });

  test.each([
    ['sem checkout', null, sub()],
    ['checkout undefined', undefined, sub()],
    ['checkout sem subs_', checkout({ abacate_subscription_id: null }), sub()],
    ['checkout sem completed_at', checkout({ completed_at: null }), sub()],
    ['sem linha', checkout(), null],
    ['linha undefined', checkout(), undefined],
    ['linha active', checkout(), sub({ status: 'active' })],
    ['linha canceled', checkout(), sub({ status: 'canceled' })],
    ['linha já com este subs_', checkout(), sub({ abacate_subscription_id: 'subs_9' })],
    [
      'checkout ANTERIOR ao pending (histórico)',
      checkout(),
      sub({ updated_at: '2026-11-08 11:30:01' }),
    ],
  ])('%s → não pendente', (_l, c, s) => {
    expect(isActivationPending(c, s)).toBe(false);
  });
});
