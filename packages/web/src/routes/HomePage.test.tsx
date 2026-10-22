// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PluggyNetWorthResponse, PortfolioSummary } from '@vetor-wallet/shared';
import type { ShellContext } from '../layout/ShellContext';

/**
 * Testes de COSTURA (T-092) para o "Patrimônio total" da Home (T-089e): o
 * componente somando `stockTotals.current + savingsBalance + totalBankBalance`
 * — a lógica pura em si (`computePatrimonioTotal`) já está coberta em
 * `homeMetrics.test.ts`. O que importa aqui é o isolamento de falha: a leitura
 * do saldo bancário (Pluggy) nunca pode derrubar o resto da Home, e o texto
 * que indica a origem do número só aparece com conexão ativa.
 *
 * Mesma armadilha documentada em `PluggyImportModal.test.tsx`: uma promise
 * rejeitada devolvida direto por um `vi.fn()` vira erro não tratado do
 * runner, mesmo com o componente tratando o erro corretamente — por isso os
 * mocks de leitura delegam para uma função comum (`*Impl`).
 */

const shellContext: Partial<ShellContext> = {
  walletLoaded: true,
  walletLoadError: false,
  walletSummary: {
    positions: [],
    totalInvested: 1000,
    totalCurrentValue: 1000,
    totalProfitLoss: 0,
    totalProfitLossPct: 0,
  } as PortfolioSummary,
};

vi.mock('../layout/ShellContext', async () => {
  const actual =
    await vi.importActual<typeof import('../layout/ShellContext')>('../layout/ShellContext');
  return {
    ...actual,
    useShellContext: () => shellContext,
  };
});

const NO_PLUGGY_STATUS = { enabled: false, items: [] };

const NO_NET_WORTH: PluggyNetWorthResponse = {
  enabled: true,
  connections: 0,
  failedConnections: 0,
  totalBankBalance: 0,
};

let netWorthImpl: () => Promise<PluggyNetWorthResponse> = () => Promise.resolve(NO_NET_WORTH);
/** A última promise devolvida, para o teste esperar a leitura terminar. */
let lastNetWorthCall: Promise<unknown> = Promise.resolve();

vi.mock('../api', () => ({
  getIncomeSources: () => Promise.resolve([]),
  getIncomeEntries: () => Promise.resolve({ month: '2026-10', entries: [] }),
  getFixedExpenses: () => Promise.resolve([]),
  getExpenseEntries: () => Promise.resolve({ month: '2026-10', entries: [] }),
  getSavings: () =>
    Promise.resolve({
      entries: [],
      summary: { balance: 200, totalDeposits: 200, totalYield: 0, totalWithdrawals: 0 },
    }),
  getPluggyStatus: () => Promise.resolve(NO_PLUGGY_STATUS),
  getPluggyNetWorth: () => (lastNetWorthCall = netWorthImpl()),
}));

const { HomePage } = await import('./HomePage');

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
}

async function settleNetWorth() {
  await act(async () => {
    await lastNetWorthCall.catch(() => {});
  });
}

afterEach(() => {
  cleanup();
  netWorthImpl = () => Promise.resolve(NO_NET_WORTH);
});

describe('HomePage — patrimônio total com saldo bancário (T-089e)', () => {
  it('sem conexão: patrimônio é só ações + poupança do app, sem o aviso de banco', async () => {
    renderPage();
    await settleNetWorth();

    // 1000 (ações) + 200 (poupança) = 1.200,00; sem o saldo bancário.
    expect(await screen.findByText('R$ 1.200,00')).toBeTruthy();
    expect(screen.queryByText(/Inclui saldo da sua conexão bancária/)).toBeNull();
  });

  it('integração desligada (enabled: false): idem, não soma nem avisa', async () => {
    netWorthImpl = () =>
      Promise.resolve({
        enabled: false,
        connections: 0,
        failedConnections: 0,
        totalBankBalance: 0,
      });

    renderPage();
    await settleNetWorth();

    expect(await screen.findByText('R$ 1.200,00')).toBeTruthy();
    expect(screen.queryByText(/Inclui saldo da sua conexão bancária/)).toBeNull();
  });

  it('com conexão ativa: soma o saldo bancário e avisa de onde vem o número', async () => {
    netWorthImpl = () =>
      Promise.resolve({
        enabled: true,
        connections: 1,
        failedConnections: 0,
        totalBankBalance: 300,
      });

    renderPage();

    // 1000 + 200 + 300 = 1.500,00.
    expect(await screen.findByText('R$ 1.500,00')).toBeTruthy();
    expect(screen.getByText('Inclui saldo da sua conexão bancária')).toBeTruthy();
  });

  it('conexão com falha parcial: soma o que leu e marca o aviso como parcial', async () => {
    netWorthImpl = () =>
      Promise.resolve({
        enabled: true,
        connections: 2,
        failedConnections: 1,
        totalBankBalance: 300,
      });

    renderPage();

    expect(await screen.findByText('R$ 1.500,00')).toBeTruthy();
    expect(screen.getByText(/Inclui saldo da sua conexão bancária.*parcial/)).toBeTruthy();
  });

  it('isolamento: a leitura do saldo bancário falha e a Home renderiza normalmente', async () => {
    netWorthImpl = () => Promise.reject(new Error('Falha ao ler o saldo da conexão bancária'));

    renderPage();
    await settleNetWorth();

    // Patrimônio cai para ações + poupança, sem erro visível no lugar do número.
    expect(await screen.findByText('R$ 1.200,00')).toBeTruthy();
    expect(screen.queryByText(/Inclui saldo da sua conexão bancária/)).toBeNull();
    expect(screen.queryByText('Falha ao ler o saldo da conexão bancária')).toBeNull();
    // O resto da Home (renda/despesas/sobra do mês) segue de pé.
    expect(screen.getAllByText('Renda').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Despesas').length).toBeGreaterThan(0);
  });
});
