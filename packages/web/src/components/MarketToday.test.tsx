// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MarketQuote, MarketTodayResponse } from '@vetor-wallet/shared';

// Impl em função comum (não vi.fn().mockRejectedValue): ver PluggyImportModal.test.tsx.
let impl: () => Promise<MarketTodayResponse> = async () => {
  throw new Error('não configurado');
};
vi.mock('../api', () => ({ getMarketToday: () => impl() }));

import { MarketToday } from './MarketToday';

const q = (ticker: string, change: number, close = 10): MarketQuote => ({
  ticker,
  name: `Empresa ${ticker}`,
  close,
  change,
  volume: 1_000_000,
  marketCap: 1e9,
  sector: null,
});

const response = (over: Partial<MarketTodayResponse> = {}): MarketTodayResponse => ({
  gainers: [q('UPAA3', 4.5, 12.34)],
  losers: [q('DNBB4', -2.1)],
  mostTraded: [q('VOLC3', 0.5)],
  asOf: '2026-11-26T15:00:00.000Z',
  minTradedValue: 5_000_000,
  ...over,
});

afterEach(cleanup);

describe('MarketToday', () => {
  it('mostra carregando, depois a lista com sinal, preço e o aviso de atraso com horário', async () => {
    impl = async () => response();
    render(<MarketToday positions={[]} />);
    expect(screen.getByText('Carregando mercado…')).toBeTruthy();
    await screen.findByText('UPAA3');
    expect(screen.getByText('+4,50%')).toBeTruthy();
    expect(screen.getByText(/R\$\s?12,34/)).toBeTruthy();
    expect(screen.getByText(/Cotações com atraso · dado das 26\/11 12:00/)).toBeTruthy();
  });

  it('troca de aba para baixas com variação negativa', async () => {
    impl = async () => response();
    render(<MarketToday positions={[]} />);
    await screen.findByText('UPAA3');
    fireEvent.click(screen.getByRole('button', { name: 'Maiores baixas' }));
    expect(screen.getByText('DNBB4')).toBeTruthy();
    expect(screen.getByText('-2,10%')).toBeTruthy();
    expect(screen.queryByText('UPAA3')).toBeNull();
  });

  it('marca só os tickers que o usuário já tem na carteira', async () => {
    impl = async () => response({ gainers: [q('UPAA3', 4), q('OUTR3', 3)] });
    render(<MarketToday positions={[{ ticker: 'upaa3' }]} />);
    await screen.findByText('UPAA3');
    expect(screen.getAllByText('Na carteira')).toHaveLength(1);
  });

  it('lista vazia mostra a mensagem de vazio', async () => {
    impl = async () => response({ gainers: [] });
    render(<MarketToday positions={null} />);
    await screen.findByText('Nenhuma ação em alta com liquidez hoje.');
  });

  it('erro mostra aviso isolado e "Tentar novamente" refaz o fetch', async () => {
    impl = async () => {
      throw new Error('falhou');
    };
    render(<MarketToday positions={[]} />);
    await screen.findByRole('alert');
    impl = async () => response();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getByText('UPAA3')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
