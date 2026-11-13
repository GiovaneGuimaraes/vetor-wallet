// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MySubscriptionResponse, Subscription, User } from '@vetor-wallet/shared';
import type { ShellContext } from '../layout/ShellContext';

/**
 * Costura da `/conta` (T-124c): o card "Assinatura" chamando a lógica pura de
 * `planos.ts` (`subscriptionUiState`, `subscriptionStatusLabel`,
 * `subscriptionProviderLabel`). O achado que motivou este arquivo: checkout de
 * cartão não pago (`pending`, `provider: null`) aparecia como "Pix (não renova)".
 */

const user: User = {
  id: 1,
  email: 'conta@example.com',
  name: 'Fulano',
  phone: null,
  created_at: '2026-01-01 00:00:00',
  roles: [],
} as User;

const shellContext: Partial<ShellContext> = { user, onUserUpdated: () => {} };

vi.mock('../layout/ShellContext', async () => {
  const actual =
    await vi.importActual<typeof import('../layout/ShellContext')>('../layout/ShellContext');
  return { ...actual, useShellContext: () => shellContext };
});

let meImpl: () => Promise<MySubscriptionResponse> = () => Promise.resolve(me());

const redirectTo = vi.fn();
let portalImpl: () => Promise<{ url: string }> = () =>
  Promise.resolve({ url: 'https://portal.example.com/s' });

vi.mock('../navigation', () => ({ redirectTo: (url: string) => redirectTo(url) }));

vi.mock('../api', () => ({
  getMySubscription: () => meImpl(),
  openCustomerPortal: () => portalImpl(),
  updateMe: vi.fn(),
  changePassword: vi.fn(),
}));

const { ContaPage } = await import('./ContaPage');

const PLAN = {
  id: 1,
  code: 'pro_monthly',
  name: 'Pro Mensal',
  description: '',
  price_cents: 990,
  interval: 'monthly' as const,
  active: true,
};

function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 1,
    plan_id: 1,
    status: 'active',
    current_period_end: '2099-03-15 12:00:00',
    created_at: '2026-01-01 00:00:00',
    provider: 'abacatepay_card',
    provider_status: 'ACTIVE',
    canceled_at: null,
    ...over,
  };
}

function me(over: Partial<MySubscriptionResponse> = {}): MySubscriptionResponse {
  return {
    billingEnabled: true,
    subscription: null,
    plan: null,
    pendingCheckout: null,
    confirming: false,
    ...over,
  };
}

function renderConta() {
  return render(
    <MemoryRouter>
      <ContaPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  redirectTo.mockClear();
  portalImpl = () => Promise.resolve({ url: 'https://portal.example.com/s' });
  meImpl = () => Promise.resolve(me());
});

describe('ContaPage — card Assinatura (T-124c)', () => {
  it('checkout de cartão não pago (pending, provider nulo) NÃO aparece como Pix', async () => {
    meImpl = () =>
      Promise.resolve(
        me({
          subscription: sub({ status: 'pending', provider: null, current_period_end: null }),
          plan: PLAN,
          pendingCheckout: { url: 'https://pay.example.com/c/1', plan_id: 1, created_at: '' },
        })
      );
    renderConta();

    expect(await screen.findByText('Status: Aguardando pagamento')).toBeTruthy();
    expect(screen.queryByText(/Pix/)).toBeNull();
    expect(screen.queryByText(/Pagamento:/)).toBeNull();
  });

  it('Pix legado ativo no período → "Pix (não renova)"', async () => {
    meImpl = () =>
      Promise.resolve(
        me({ subscription: sub({ provider: null, provider_status: null }), plan: PLAN })
      );
    renderConta();

    expect(await screen.findByText('Pagamento: Pix (não renova)')).toBeTruthy();
    expect(screen.getByText('Status: Ativa')).toBeTruthy();
  });

  it('cartão ativo → "Cartão de crédito (renovação automática)" e válido até', async () => {
    meImpl = () => Promise.resolve(me({ subscription: sub(), plan: PLAN }));
    renderConta();

    expect(
      await screen.findByText('Pagamento: Cartão de crédito (renovação automática)')
    ).toBeTruthy();
    expect(screen.getByText(/válido até 15 de março de 2099/)).toBeTruthy();
  });

  it('cancelada com período futuro → "acesso até" a data', async () => {
    meImpl = () => Promise.resolve(me({ subscription: sub({ status: 'canceled' }), plan: PLAN }));
    renderConta();

    expect(await screen.findByText('Status: Cancelada (acesso até o fim do período)')).toBeTruthy();
    expect(screen.getByText(/acesso até 15 de março de 2099/)).toBeTruthy();
  });

  it('pending sem checkout com período antigo → "Vencida", igual à /planos', async () => {
    meImpl = () =>
      Promise.resolve(
        me({
          subscription: sub({
            status: 'pending',
            provider: null,
            current_period_end: '2020-01-01 00:00:00',
          }),
          plan: PLAN,
        })
      );
    renderConta();

    expect(await screen.findByText('Status: Vencida')).toBeTruthy();
    expect(screen.queryByText(/Pix/)).toBeNull();
  });

  it('expired → "Vencida" e "venceu em"', async () => {
    meImpl = () =>
      Promise.resolve(
        me({
          subscription: sub({
            status: 'expired',
            provider: null,
            current_period_end: '2020-01-01 00:00:00',
          }),
          plan: PLAN,
        })
      );
    renderConta();

    expect(await screen.findByText('Status: Vencida')).toBeTruthy();
    expect(screen.getByText(/venceu em/)).toBeTruthy();
    expect(screen.getByText('Pagamento: Pix (não renova)')).toBeTruthy();
  });
});

describe('ContaPage — cancelar assinatura', () => {
  it('cartão ativo: "Cancelar assinatura" abre o portal', async () => {
    meImpl = () => Promise.resolve(me({ subscription: sub(), plan: PLAN }));
    renderConta();

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar assinatura' }));

    await vi.waitFor(() => expect(redirectTo).toHaveBeenCalledWith('https://portal.example.com/s'));
  });

  it('falha do portal mostra o erro e destrava o botão', async () => {
    meImpl = () => Promise.resolve(me({ subscription: sub(), plan: PLAN }));
    portalImpl = () =>
      Promise.reject(Object.assign(new Error('x'), { code: 'PAYMENT_PROVIDER_ERROR' }));
    renderConta();

    const btn = await screen.findByRole('button', { name: 'Cancelar assinatura' });
    fireEvent.click(btn);

    expect(await screen.findByText(/provedor de pagamento está indisponível/)).toBeTruthy();
    expect(redirectTo).not.toHaveBeenCalled();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('sem botão: Pix legado, cancelada, vencida, pendente e sem assinatura', async () => {
    const cases: MySubscriptionResponse[] = [
      me({ subscription: sub({ provider: null, provider_status: null }), plan: PLAN }),
      me({ subscription: sub({ status: 'canceled' }), plan: PLAN }),
      me({
        subscription: sub({
          status: 'expired',
          provider: null,
          current_period_end: '2020-01-01 00:00:00',
        }),
        plan: PLAN,
      }),
      me({
        subscription: sub({ status: 'pending', provider: null, current_period_end: null }),
        plan: PLAN,
        pendingCheckout: { url: 'https://pay.example.com/c/1', plan_id: 1, created_at: '' },
      }),
      me(),
    ];
    for (const c of cases) {
      meImpl = () => Promise.resolve(c);
      const { unmount } = renderConta();
      await vi.waitFor(() => expect(screen.queryByText('Carregando...')).toBeNull());
      expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).toBeNull();
      unmount();
    }
  });
});

describe('ContaPage — cancelar assinatura nos demais estados do gate', () => {
  it('pagamento recusado (PAYMENT_FAILED) mostra o botão', async () => {
    meImpl = () =>
      Promise.resolve(me({ subscription: sub({ provider_status: 'PAYMENT_FAILED' }), plan: PLAN }));
    renderConta();

    expect(await screen.findByRole('button', { name: 'Cancelar assinatura' })).toBeTruthy();
  });

  it('cartão vencido localmente (card_lapsed) mostra o botão', async () => {
    meImpl = () =>
      Promise.resolve(
        me({
          subscription: sub({ status: 'expired', current_period_end: '2020-01-01 00:00:00' }),
          plan: PLAN,
        })
      );
    renderConta();

    expect(await screen.findByText('Status: Verificando a renovação')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancelar assinatura' })).toBeTruthy();
  });
});
