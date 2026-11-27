// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PortfolioSummary, Position, TickerHistory } from '@vetor-wallet/shared';

// Impl em função comum (não vi.fn().mockRejectedValue): ver PluggyImportModal.test.tsx.
let histories: Record<string, TickerHistory> = {};
vi.mock('../api', () => ({
  getTickerHistory: async (t: string) => {
    const h = histories[t];
    if (!h) throw new Error('sem histórico');
    return h;
  },
}));

// jsdom não tem matchMedia; o count-up dos cards consulta prefers-reduced-motion.
window.matchMedia = ((query: string) => ({
  matches: true,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
})) as unknown as typeof window.matchMedia;

import { PortfolioDashboard } from './PortfolioDashboard';
import { tickerHistoryLoader } from './tickerHistory';

const pos = (ticker: string): Position => ({
  ticker,
  quantity: 10,
  avgPrice: 20,
  invested: 200,
  currentPrice: 22,
  currentValue: 220,
  profitLoss: 20,
  profitLossPct: 10,
  allocationPct: 50,
});

const summary: PortfolioSummary = {
  positions: [pos('AAAA3'), pos('BBBB4')],
  totalInvested: 400,
  totalCurrentValue: 440,
  totalProfitLoss: 40,
  totalProfitLossPct: 10,
  quotesUnavailable: false,
};

const hist = (ticker: string, closes: number[]): TickerHistory => ({
  ticker,
  name: null,
  price: null,
  changePercent: null,
  points: closes.map((close, i) => ({ date: `2026-11-${10 + i}`, close })),
  fetchedAt: '2026-11-26T15:00:00.000Z',
});

afterEach(() => {
  cleanup();
  tickerHistoryLoader.reset();
  histories = {};
});

describe('PortfolioDashboard — minigráficos das posições', () => {
  it('cada posição ganha minigráfico (ou traço sem histórico) e o ticker abre o gráfico', async () => {
    histories = { AAAA3: hist('AAAA3', [10, 9]) };
    const onSelect = vi.fn();
    render(<PortfolioDashboard summary={summary} onSelectTicker={onSelect} />);

    expect(screen.getByRole('columnheader', { name: '1 mês' })).toBeTruthy();
    const spark = await screen.findByRole('img', { name: 'AAAA3: baixa no último mês' });
    expect(spark.getAttribute('class')).toContain('vw-spark--down');
    await screen.findByTitle('Sem histórico de preço');

    fireEvent.click(screen.getByRole('button', { name: 'BBBB4' }));
    expect(onSelect).toHaveBeenCalledWith('BBBB4');
    fireEvent.click(screen.getByRole('button', { name: 'Gráfico de AAAA3' }));
    expect(onSelect).toHaveBeenCalledWith('AAAA3');
  });
});
