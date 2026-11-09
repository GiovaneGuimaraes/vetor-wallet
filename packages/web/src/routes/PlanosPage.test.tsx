// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type {
  CreateSubscriptionResponse,
  MySubscriptionResponse,
  Plan,
  Subscription,
  SyncSubscriptionResponse,
} from '@vetor-wallet/shared';

/**
 * Testes de COSTURA da `/planos` no cartão (T-124c): o componente chamando a
 * lógica pura de `planos.ts` (estado, mensagens, backoff) e o fluxo dentro dele
 * — redirect para o checkout, confirmação ao voltar, erro do POST. A lógica
 * pura em si fica em `planos.test.ts`.
 *
 * Armadilha (CLAUDE.md raiz): `mockRejectedValue` num `vi.fn()` faz o runner
 * tratar a rejeição como erro não tratado. Os spies só registram; quem rejeita
 * é uma função comum (`createImpl`).
 */

const syncSubscription = vi.fn();
const getMySubscription = vi.fn();
const getPlans = vi.fn();
const createSubscription = vi.fn();
const openCustomerPortal = vi.fn();
const redirectTo = vi.fn();

let syncImpl: () => Promise<SyncSubscriptionResponse> = () => Promise.resolve(me());
let createImpl: () => Promise<CreateSubscriptionResponse> = () =>
  Promise.reject(new Error('não definido'));

vi.mock('../api', () => ({
  syncSubscription: () => {
    syncSubscription();
    return syncImpl();
  },
  getMySubscription: () => getMySubscription(),
  getPlans: () => getPlans(),
  createSubscription: (...args: unknown[]) => {
    createSubscription(...args);
    return createImpl();
  },
  openCustomerPortal: () => openCustomerPortal(),
}));
vi.mock('../navigation', () => ({ redirectTo: (url: string) => redirectTo(url) }));

const { PlanosPage } = await import('./PlanosPage');

const PLANS: Plan[] = [
  {
    id: 1,
    code: 'pro_monthly',
    name: 'Pro Mensal',
    description: '',
    price_cents: 990,
    interval: 'monthly',
    active: true,
  },
  {
    id: 2,
    code: 'pro_yearly',
    name: 'Pro Anual',
    description: '',
    price_cents: 9900,
    interval: 'yearly',
    active: true,
  },
];

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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(entry = '/planos') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/planos"
          element={
            <>
              <PlanosPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

/** Deixa as promises pendentes resolverem dentro do `act`. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  syncImpl = () => Promise.resolve(me());
  createImpl = () => Promise.reject(new Error('não definido'));
  getPlans.mockResolvedValue(PLANS);
  getMySubscription.mockResolvedValue(me());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('PlanosPage (cartão, T-124c)', () => {
  it('ao abrir chama o sync uma vez e mostra a vitrine', async () => {
    renderPage();

    expect(await screen.findByText('Pro Mensal')).toBeTruthy();
    expect(syncSubscription).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button', { name: 'Assinar' })).toHaveLength(2);
  });

  it('Assinar → POST do plano e redirect para a URL hospedada do checkout', async () => {
    createImpl = () =>
      Promise.resolve({
        subscription: sub({ status: 'pending', current_period_end: null }),
        checkout: { id: 7, url: 'https://pay.example.com/c/abc' },
      });
    renderPage();

    const [monthly] = await screen.findAllByRole('button', { name: 'Assinar' });
    fireEvent.click(monthly);
    await flush();

    expect(createSubscription).toHaveBeenCalledWith(1);
    expect(redirectTo).toHaveBeenCalledWith('https://pay.example.com/c/abc');
  });

  it('erro 409 ALREADY_SUBSCRIBED mostra a mensagem e não redireciona', async () => {
    createImpl = () =>
      Promise.reject(Object.assign(new Error('Já existe'), { code: 'ALREADY_SUBSCRIBED' }));
    renderPage();

    const [monthly] = await screen.findAllByRole('button', { name: 'Assinar' });
    fireEvent.click(monthly);

    expect(await screen.findByText('Você já tem uma assinatura ativa.')).toBeTruthy();
    expect(redirectTo).not.toHaveBeenCalled();
    expect((monthly as HTMLButtonElement).disabled).toBe(false);
  });

  it('erro 502 do provedor mostra a mensagem de indisponível', async () => {
    createImpl = () =>
      Promise.reject(Object.assign(new Error('x'), { code: 'PAYMENT_PROVIDER_ERROR' }));
    renderPage();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Assinar' }))[0]);

    expect(await screen.findByText(/provedor de pagamento está indisponível/)).toBeTruthy();
  });

  it('?checkout=completed mostra "Confirmando", repete o sync e ativa; depois limpa o parâmetro', async () => {
    vi.useFakeTimers();
    let calls = 0;
    syncImpl = () => {
      calls += 1;
      return Promise.resolve(
        calls < 2
          ? me({
              subscription: sub({ status: 'pending', current_period_end: null }),
              pendingCheckout: { url: 'https://pay.example.com/c/1', plan_id: 1, created_at: '' },
            })
          : me({ subscription: sub(), plan: PLANS[0] })
      );
    };

    renderPage('/planos?checkout=completed');
    await flush();
    await flush();

    expect(screen.getByText('Confirmando pagamento…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continuar pagamento' })).toBeNull();
    expect(screen.getByTestId('location').textContent).toBe('/planos?checkout=completed');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(calls).toBe(2);
    expect(screen.queryByText('Confirmando pagamento…')).toBeNull();
    expect(screen.getByText('Pagamento confirmado! Sua assinatura está ativa.')).toBeTruthy();
    expect(screen.getByText(/válido até 15 de março de 2099/)).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/planos');
  });

  it('pending_checkout mostra "Continuar pagamento" com a URL do checkout aberto', async () => {
    syncImpl = () =>
      Promise.resolve(
        me({
          subscription: sub({ status: 'pending', current_period_end: null }),
          pendingCheckout: {
            url: 'https://pay.example.com/c/open',
            plan_id: 2,
            created_at: '2026-01-01 00:00:00',
          },
        })
      );
    renderPage();

    const button = await screen.findByRole('button', { name: 'Continuar pagamento' });
    expect(screen.getByText(/pagamento em aberto do Pro Anual/)).toBeTruthy();
    fireEvent.click(button);
    expect(redirectTo).toHaveBeenCalledWith('https://pay.example.com/c/open');
  });

  it('active mostra a validade e "Gerenciar assinatura" abre o portal', async () => {
    syncImpl = () => Promise.resolve(me({ subscription: sub(), plan: PLANS[0] }));
    openCustomerPortal.mockResolvedValue({ url: 'https://portal.example.com/s' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar assinatura' }));
    await flush();

    expect(screen.getByText(/válido até 15 de março de 2099/)).toBeTruthy();
    expect(redirectTo).toHaveBeenCalledWith('https://portal.example.com/s');
    expect(screen.queryByRole('button', { name: 'Assinar' })).toBeNull();
  });

  it('canceled_with_access mostra "acesso até" a data e não oferece Assinar', async () => {
    syncImpl = () =>
      Promise.resolve(me({ subscription: sub({ status: 'canceled' }), plan: PLANS[0] }));
    renderPage();

    expect(await screen.findByText(/Assinatura cancelada/)).toBeTruthy();
    expect(screen.getByText(/até 15 de março de 2099/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Assinar' })).toBeNull();
  });

  it('legacy_pix mostra que não renova e não oferece Assinar antes de vencer', async () => {
    syncImpl = () =>
      Promise.resolve(
        me({ subscription: sub({ provider: null, provider_status: null }), plan: PLANS[0] })
      );
    renderPage();

    expect(await screen.findByText(/não renova/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Assinar' })).toBeNull();
  });

  it('payment_failed pede para atualizar o cartão pelo portal', async () => {
    syncImpl = () =>
      Promise.resolve(
        me({ subscription: sub({ provider_status: 'PAYMENT_FAILED' }), plan: PLANS[0] })
      );
    renderPage();

    expect(await screen.findByRole('button', { name: 'Atualizar cartão' })).toBeTruthy();
    expect(screen.getByText(/Não conseguimos cobrar o seu cartão/)).toBeTruthy();
  });

  it('sync falhando cai no /me (só leitura) e a tela não quebra', async () => {
    syncImpl = () => Promise.reject(new Error('500'));
    getMySubscription.mockResolvedValue(me({ subscription: sub(), plan: PLANS[0] }));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Gerenciar assinatura' })).toBeTruthy();
    expect(getMySubscription).toHaveBeenCalledTimes(1);
  });

  it('nenhum QR Code nem copia-e-cola é renderizado', async () => {
    syncImpl = () =>
      Promise.resolve(
        me({
          subscription: sub({ status: 'pending', current_period_end: null }),
          pendingCheckout: { url: 'https://pay.example.com/c/1', plan_id: 1, created_at: '' },
        })
      );
    const { container } = renderPage();
    await screen.findByRole('button', { name: 'Continuar pagamento' });

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
    expect(screen.queryByText(/Pix copia e cola/i)).toBeNull();
    expect(screen.queryByText(/QR Code/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Simular pagamento/ })).toBeNull();
  });

  it('staging mostra o banner e mantém a vitrine', async () => {
    syncImpl = () => Promise.resolve(me({ billingEnabled: false }));
    renderPage();

    expect(await screen.findByText(/Ambiente de staging/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Assinar' })).toHaveLength(2);
  });
});
