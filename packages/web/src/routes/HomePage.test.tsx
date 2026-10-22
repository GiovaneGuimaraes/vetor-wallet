// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  FixedIncomePosition,
  FixedIncomeSummary,
  PluggyFixedIncomePosition,
  PluggyFixedIncomeResponse,
  PluggyNetWorthResponse,
  PortfolioSummary,
} from '@vetor-wallet/shared';
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

// T-091d (d4): Renda Fixa manual e da conexão. Default = nenhuma posição, para
// os testes da T-089e acima seguirem medindo só ações + poupança + banco.
// Valores inventados — fixture nunca carrega dado real.
type FixedIncomeData = { positions: FixedIncomePosition[]; summary: FixedIncomeSummary };
const NO_FIXED_INCOME: FixedIncomeData = {
  positions: [],
  summary: { totalInvested: 0, totalCurrent: 0 },
};
const NO_PLUGGY_FIXED_INCOME: PluggyFixedIncomeResponse = {
  enabled: true,
  connections: 0,
  failedConnections: 0,
  positions: [],
  otherInvestments: 0,
};
let fixedIncomeImpl: () => Promise<FixedIncomeData> = () => Promise.resolve(NO_FIXED_INCOME);
let pluggyFixedIncomeImpl: () => Promise<PluggyFixedIncomeResponse> = () =>
  Promise.resolve(NO_PLUGGY_FIXED_INCOME);

vi.mock('../api', () => ({
  getFixedIncome: () => fixedIncomeImpl(),
  getPluggyFixedIncome: () => pluggyFixedIncomeImpl(),
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
  fixedIncomeImpl = () => Promise.resolve(NO_FIXED_INCOME);
  pluggyFixedIncomeImpl = () => Promise.resolve(NO_PLUGGY_FIXED_INCOME);
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

// T-091d, fatia d4: Renda Fixa consolidada (manual líquida + conexão) no patrimônio.
function manualPosition(overrides: Partial<FixedIncomePosition> = {}): FixedIncomePosition {
  return {
    id: 1,
    user_id: 1,
    name: 'CDB Teste',
    kind: 'CDB',
    institution: '',
    invested_amount: 400,
    invested_at: '2026-01-01',
    maturity_date: '2030-01-01',
    rate_type: 'CDI',
    rate: 100,
    current_value: null,
    current_value_date: null,
    superseded_by_pluggy_investment_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function pluggyPosition(
  overrides: Partial<PluggyFixedIncomePosition> = {}
): PluggyFixedIncomePosition {
  return {
    id: 'inv-1',
    name: 'Investimento Teste',
    subtype: 'CDB',
    institution: null,
    investedAmount: 100,
    currentValue: 110,
    currentValueDate: '2026-10-01',
    maturityDate: '2030-01-01',
    rateType: null,
    rate: null,
    ...overrides,
  };
}

function pluggyFixedIncome(positions: PluggyFixedIncomePosition[]): PluggyFixedIncomeResponse {
  return { ...NO_PLUGGY_FIXED_INCOME, connections: 1, positions };
}

const BANK_300: PluggyNetWorthResponse = {
  enabled: true,
  connections: 1,
  failedConnections: 0,
  totalBankBalance: 300,
};

/** Deixa a cadeia de leituras (status → saldo → RF da conexão) terminar. */
async function settleAll() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const OVERLAP = /Pode haver sobreposição entre a conexão bancária/;

describe('HomePage — patrimônio total com Renda Fixa (T-091d, d4)', () => {
  it('soma ações + poupança + banco + RF manual, e diz que inclui os dois', async () => {
    netWorthImpl = () => Promise.resolve(BANK_300);
    fixedIncomeImpl = () =>
      Promise.resolve({
        positions: [manualPosition()],
        summary: { totalInvested: 400, totalCurrent: 400 },
      });

    renderPage();
    await settleAll();

    // 1000 (ações) + 200 (poupança) + 300 (banco) + 400 (RF manual) = 1.900,00.
    expect(await screen.findByText('R$ 1.900,00')).toBeTruthy();
    expect(screen.getByText('Inclui Renda Fixa e saldo da sua conexão bancária')).toBeTruthy();
    // RF só manual: nada da conexão para sobrepor ao saldo bancário.
    expect(screen.queryByText(OVERLAP)).toBeNull();
  });

  it('posição manual coberta por vínculo ativo NÃO conta duas vezes', async () => {
    fixedIncomeImpl = () =>
      Promise.resolve({
        positions: [
          manualPosition({ id: 1, invested_amount: 100 }),
          manualPosition({
            id: 2,
            invested_amount: 250,
            superseded_by_pluggy_investment_id: 'inv-1',
          }),
        ],
        summary: { totalInvested: 350, totalCurrent: 350 },
      });
    pluggyFixedIncomeImpl = () => Promise.resolve(pluggyFixedIncome([pluggyPosition()]));

    renderPage();
    await settleAll();

    // 1000 + 200 + 100 (manual solta) + 110 (conexão) = 1.410,00 — os 250 da
    // vinculada ficam de fora (seria 1.660,00 contando duas vezes).
    expect(await screen.findByText('R$ 1.410,00')).toBeTruthy();
    expect(screen.getByText('Inclui Renda Fixa')).toBeTruthy();
    // Sem saldo bancário, não há sobreposição a avisar.
    expect(screen.queryByText(OVERLAP)).toBeNull();
  });

  it('isolamento: a RF manual falha e o patrimônio volta a ações + poupança + banco', async () => {
    netWorthImpl = () => Promise.resolve(BANK_300);
    fixedIncomeImpl = () => Promise.reject(new Error('Falha ao buscar posições de renda fixa'));
    pluggyFixedIncomeImpl = () => Promise.resolve(pluggyFixedIncome([pluggyPosition()]));

    renderPage();
    await settleAll();

    expect(await screen.findByText('R$ 1.500,00')).toBeTruthy();
    expect(screen.getByText('Inclui saldo da sua conexão bancária')).toBeTruthy();
    expect(screen.queryByText('Falha ao buscar posições de renda fixa')).toBeNull();
    expect(screen.queryByText(OVERLAP)).toBeNull();
  });

  it('isolamento: a RF da conexão falha e a manual (inclusive vinculada) segue somando', async () => {
    fixedIncomeImpl = () =>
      Promise.resolve({
        positions: [manualPosition({ superseded_by_pluggy_investment_id: 'inv-1' })],
        summary: { totalInvested: 400, totalCurrent: 400 },
      });
    pluggyFixedIncomeImpl = () =>
      Promise.reject(new Error('Falha ao ler a renda fixa da conexão bancária'));

    renderPage();
    await settleAll();

    // 1000 + 200 + 400: sem a leitura da conexão, a vinculada volta a contar.
    expect(await screen.findByText('R$ 1.600,00')).toBeTruthy();
    expect(screen.queryByText('Falha ao ler a renda fixa da conexão bancária')).toBeNull();
  });

  it('aviso de sobreposição: só com saldo bancário E RF da conexão, os dois não-zero', async () => {
    netWorthImpl = () => Promise.resolve(BANK_300);
    pluggyFixedIncomeImpl = () => Promise.resolve(pluggyFixedIncome([pluggyPosition()]));

    renderPage();
    await settleAll();

    // 1000 + 200 + 300 + 110 = 1.610,00 — soma normalmente, só avisa.
    expect(await screen.findByText('R$ 1.610,00')).toBeTruthy();
    expect(
      screen.getByText(
        'Pode haver sobreposição entre a conexão bancária e investimentos de baixo risco; detalhe em Investimentos.'
      )
    ).toBeTruthy();
  });
});
