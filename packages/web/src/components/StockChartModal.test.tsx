// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TickerHistory } from '@vetor-wallet/shared';

// Impl em função comum (não vi.fn().mockRejectedValue): ver PluggyImportModal.test.tsx.
let histories: Record<string, TickerHistory> = {};
const historyCalls: string[] = [];
vi.mock('../api', () => ({
  getTickerHistory: async (t: string) => {
    historyCalls.push(t);
    const h = histories[t];
    if (!h) throw new Error('sem histórico');
    return h;
  },
}));

import { StockChartModal } from './StockChartModal';
import { tickerHistoryLoader } from './tickerHistory';

/** 63 pregões diários terminando em 2026-11-25: preço sobe 1 por dia a partir de 100. */
function threeMonths(ticker: string): TickerHistory {
  const end = Date.parse('2026-11-25T00:00:00Z');
  const points = Array.from({ length: 63 }, (_, i) => ({
    date: new Date(end - (62 - i) * 86_400_000).toISOString().slice(0, 10),
    close: 100 + i,
  }));
  return {
    ticker,
    name: 'Empresa Teste SA',
    price: 162,
    changePercent: 0.6,
    points,
    fetchedAt: '2026-11-26T15:00:00.000Z',
  };
}

afterEach(() => {
  cleanup();
  tickerHistoryLoader.reset();
  histories = {};
  historyCalls.length = 0;
});

describe('StockChartModal', () => {
  it('abre em 1M e troca para 5D/3M recortando o MESMO histórico (1 requisição)', async () => {
    histories = { PETR4: threeMonths('PETR4') };
    render(<StockChartModal ticker="PETR4" averagePrice={120} onClose={() => {}} />);

    expect(screen.getByText('Carregando histórico…')).toBeTruthy();
    // 1M: 25/10 → 25/11 (pregões corridos no fixture) = 131 → 162.
    await screen.findByText('Início (25/10)');
    expect(screen.getAllByText(/R\$\s?131,00/).length).toBeGreaterThan(0);
    expect(screen.getByText('Empresa Teste SA')).toBeTruthy();
    expect(screen.getByRole('button', { name: '1M' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '5D' }));
    expect(screen.getByText('Início (21/11)')).toBeTruthy();
    expect(screen.getByText('+2,53%')).toBeTruthy(); // 158 → 162

    fireEvent.click(screen.getByRole('button', { name: '3M' }));
    expect(screen.getByText('Início (24/09)')).toBeTruthy();
    expect(screen.getByText('+62,00%')).toBeTruthy(); // 100 → 162

    // Preço médio do usuário aparece como referência no gráfico.
    expect(screen.getByText(/Médio: R\$\s?120,00/)).toBeTruthy();
    expect(historyCalls).toEqual(['PETR4']);
  });

  it('não oferece 1D nem 1A (o plano grátis não entrega)', async () => {
    histories = { PETR4: threeMonths('PETR4') };
    render(<StockChartModal ticker="PETR4" onClose={() => {}} />);
    await screen.findByText('Início (25/10)');
    const periods = screen
      .getByRole('group', { name: 'Período do gráfico' })
      .querySelectorAll('button');
    expect([...periods].map((b) => b.textContent)).toEqual(['5D', '1M', '3M']);
  });

  it('Ibovespa em pontos, sem linha de preço médio', async () => {
    histories = { '^BVSP': threeMonths('^BVSP') };
    render(<StockChartModal ticker="^BVSP" name="Ibovespa" averagePrice={50} onClose={() => {}} />);
    await screen.findByText('Início (25/10)');
    expect(screen.getAllByText('162 pts').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Ibovespa' })).toBeTruthy();
    expect(screen.queryByText(/Médio:/)).toBeNull();
  });

  it('erro mostra aviso; poucos pontos mostram vazio; Esc e × fecham', async () => {
    const onClose = vi.fn();
    const { unmount } = render(<StockChartModal ticker="NADA3" onClose={onClose} />);
    await screen.findByRole('alert');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    histories = { NOVA3: { ...threeMonths('NOVA3'), points: [{ date: '2026-11-25', close: 1 }] } };
    render(<StockChartModal ticker="NOVA3" onClose={onClose} />);
    await screen.findByText('Sem histórico suficiente para este período.');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('foco: entra no diálogo, Tab fica preso dentro e volta para quem abriu ao fechar', async () => {
    histories = { PETR4: threeMonths('PETR4') };
    const opener = document.createElement('button');
    opener.textContent = 'abrir';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<StockChartModal ticker="PETR4" onClose={() => {}} />);
    await screen.findByText('Início (25/10)');
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);

    const close = screen.getByRole('button', { name: 'Fechar' });
    const last = screen.getByRole('button', { name: '3M' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
