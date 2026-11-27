// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { PortfolioSummary, Position } from '@vetor-wallet/shared';
import type { ShellContext } from '../layout/ShellContext';

/**
 * Costura das abas de /investimentos/acoes: aba na URL, painel único montado e
 * — o que importa para a cota da brapi — o Mercado só pede dado quando a aba é
 * aberta. Mocks delegam a funções comuns (armadilha do `mockRejectedValue`,
 * ver `PluggyImportModal.test.tsx`).
 */

const calls: string[] = [];
vi.mock('../api', () => ({
  getOperations: async () => {
    calls.push('operations');
    return [];
  },
  createOperation: async () => ({}),
  deleteOperation: async () => undefined,
  getPortfolioHistory: async () => {
    calls.push('portfolioHistory');
    return { points: [] };
  },
  getBenchmarkHistory: async () => ({}),
  getSnapshots: async () => [],
  getMarketToday: async () => {
    calls.push('marketToday');
    return { asOf: '2026-11-26T15:00:00.000Z', gainers: [], losers: [], mostTraded: [] };
  },
  getTickerHistory: async (t: string) => {
    calls.push(`history:${t}`);
    throw new Error('sem histórico');
  },
  getOperationsFor: async () => [],
}));

window.matchMedia = ((query: string) => ({
  matches: true,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
})) as unknown as typeof window.matchMedia;

const pos = (ticker: string, allocationPct: number | null): Position => ({
  ticker,
  quantity: 10,
  avgPrice: 20,
  invested: 200,
  currentPrice: 22,
  currentValue: 220,
  profitLoss: 20,
  profitLossPct: 10,
  allocationPct,
});

let shellContext: Partial<ShellContext>;
const baseSummary = (positions: Position[]): PortfolioSummary => ({
  positions,
  totalInvested: 400,
  totalCurrentValue: 440,
  totalProfitLoss: 40,
  totalProfitLossPct: 10,
  quotesUnavailable: false,
});

vi.mock('../layout/ShellContext', async () => {
  const actual =
    await vi.importActual<typeof import('../layout/ShellContext')>('../layout/ShellContext');
  return { ...actual, useShellContext: () => shellContext };
});

import { DashboardPage } from './DashboardPage';
import { tickerHistoryLoader } from '../components/tickerHistory';

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="loc">{loc.pathname + loc.search}</output>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DashboardPage />
      <LocationProbe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  calls.length = 0;
  shellContext = {
    wallet: null,
    walletLoaded: true,
    walletLoadError: false,
    walletSummary: baseSummary([pos('AAAA3', 30), pos('BBBB4', 70)]),
    refreshWallet: async () => {},
  };
});

afterEach(() => {
  cleanup();
  tickerHistoryLoader.reset();
});

describe('DashboardPage — abas', () => {
  it('abre na Carteira por padrão, com a alocação dentro da tabela de Posições', async () => {
    renderAt('/investimentos/acoes');

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Carteira', 'Mercado', 'Operações']);
    expect(screen.getByRole('tab', { name: 'Carteira' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(await screen.findByRole('tabpanel')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Alocação' })).toBeTruthy();
    // card separado de alocação não existe mais
    expect(screen.queryByRole('heading', { name: 'Alocação da carteira' })).toBeNull();
    // ordenada por alocação: BBBB4 (70%) antes de AAAA3 (30%)
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('BBBB4');
    expect(rows[0].textContent).toContain('70,0%');
    expect(rows[1].textContent).toContain('AAAA3');
    expect(screen.queryByText('Mercado hoje')).toBeNull();
    expect(screen.queryByRole('heading', { name: /^Operações/ })).toBeNull();
  });

  it('Mercado não pede nada antes da aba ser aberta; ao abrir, pede mercado e Ibovespa', async () => {
    renderAt('/investimentos/acoes');
    await screen.findByRole('tabpanel');
    await waitFor(() => expect(calls).toContain('operations'));
    expect(calls.some((c) => c === 'marketToday' || c.startsWith('history:^BVSP'))).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: 'Mercado' }));
    await screen.findByText('Mercado hoje');
    await waitFor(() => expect(calls).toContain('marketToday'));
    await waitFor(() => expect(calls).toContain('history:^BVSP'));
  });

  it('a aba ativa vai para a URL e a Carteira volta a ser a URL limpa', async () => {
    renderAt('/investimentos/acoes');
    await screen.findByRole('tabpanel');

    fireEvent.click(screen.getByRole('tab', { name: 'Operações' }));
    expect(screen.getByTestId('loc').textContent).toBe('/investimentos/acoes?aba=operacoes');
    expect(screen.getByRole('tab', { name: 'Operações' }).getAttribute('aria-selected')).toBe(
      'true'
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Carteira' }));
    expect(screen.getByTestId('loc').textContent).toBe('/investimentos/acoes');
  });

  it('recarregar com ?aba=mercado abre direto a aba; valor inválido cai na Carteira', async () => {
    renderAt('/investimentos/acoes?aba=mercado');
    expect(screen.getByRole('tab', { name: 'Mercado' }).getAttribute('aria-selected')).toBe('true');
    await screen.findByText('Mercado hoje');
    cleanup();

    renderAt('/investimentos/acoes?aba=lixo');
    expect(screen.getByRole('tab', { name: 'Carteira' }).getAttribute('aria-selected')).toBe(
      'true'
    );
  });

  it('setas, Home e End movem a seleção (roving tabindex)', async () => {
    renderAt('/investimentos/acoes');
    await screen.findByRole('tabpanel');
    const carteira = screen.getByRole('tab', { name: 'Carteira' });
    expect(carteira.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'Mercado' }).getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(carteira, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Mercado' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Mercado' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Operações' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Operações' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Carteira' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Carteira' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Operações' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Operações' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Carteira' }).getAttribute('aria-selected')).toBe(
      'true'
    );
  });

  it('o atalho "Nova operação" da Carteira leva à aba Operações com o formulário aberto', async () => {
    renderAt('/investimentos/acoes');
    await screen.findByRole('tabpanel');

    fireEvent.click(screen.getByRole('button', { name: '+ Nova operação' }));
    expect(screen.getByTestId('loc').textContent).toBe('/investimentos/acoes?aba=operacoes');
    const toggle = screen.getAllByRole('button', { name: /Nova operação/ })[0];
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('carteira vazia: o estado vazio leva a cadastrar a primeira operação', async () => {
    shellContext = { ...shellContext, walletSummary: baseSummary([]) };
    renderAt('/investimentos/acoes');
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar primeira operação' }));
    expect(screen.getByTestId('loc').textContent).toBe('/investimentos/acoes?aba=operacoes');
  });
});
