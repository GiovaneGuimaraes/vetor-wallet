// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MarketQuote, MarketTodayResponse, TickerHistory } from '@vetor-wallet/shared';

// Impl em função comum (não vi.fn().mockRejectedValue): ver PluggyImportModal.test.tsx.
let impl: () => Promise<MarketTodayResponse> = async () => {
  throw new Error('não configurado');
};
// Históricos: por ticker; ausente = erro (ativo sem histórico).
let histories: Record<string, TickerHistory> = {};
const historyCalls: string[] = [];
let historyGate: Promise<void> = Promise.resolve();
vi.mock('../api', () => ({
  getMarketToday: () => impl(),
  getTickerHistory: async (t: string) => {
    historyCalls.push(t);
    await historyGate;
    const h = histories[t];
    if (!h) throw new Error('sem histórico');
    return h;
  },
}));

import { MarketToday } from './MarketToday';
import { tickerHistoryLoader } from './tickerHistory';

const noop = () => {};

const hist = (
  ticker: string,
  closes: number[],
  over: Partial<TickerHistory> = {}
): TickerHistory => ({
  ticker,
  name: null,
  price: closes[closes.length - 1] ?? null,
  changePercent: 0.5,
  points: closes.map((close, i) => ({ date: `2026-11-${String(i + 10).padStart(2, '0')}`, close })),
  fetchedAt: '2026-11-26T15:00:00.000Z',
  ...over,
});

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

afterEach(() => {
  cleanup();
  tickerHistoryLoader.reset();
  histories = {};
  historyCalls.length = 0;
  historyGate = Promise.resolve();
});

describe('MarketToday', () => {
  it('mostra carregando, depois a lista com sinal, preço e o aviso de atraso com horário', async () => {
    impl = async () => response();
    render(<MarketToday positions={[]} onSelectTicker={noop} />);
    expect(screen.getByText('Carregando mercado…')).toBeTruthy();
    await screen.findByText('UPAA3');
    expect(screen.getByText('+4,50%')).toBeTruthy();
    expect(screen.getByText(/R\$\s?12,34/)).toBeTruthy();
    expect(screen.getByText(/Cotações com atraso · dado das 26\/11 12:00/)).toBeTruthy();
  });

  it('troca de aba para baixas com variação negativa', async () => {
    impl = async () => response();
    render(<MarketToday positions={[]} onSelectTicker={noop} />);
    await screen.findByText('UPAA3');
    fireEvent.click(screen.getByRole('button', { name: 'Maiores baixas' }));
    expect(screen.getByText('DNBB4')).toBeTruthy();
    expect(screen.getByText('-2,10%')).toBeTruthy();
    expect(screen.queryByText('UPAA3')).toBeNull();
  });

  it('marca só os tickers que o usuário já tem na carteira', async () => {
    impl = async () => response({ gainers: [q('UPAA3', 4), q('OUTR3', 3)] });
    render(<MarketToday positions={[{ ticker: 'upaa3' }]} onSelectTicker={noop} />);
    await screen.findByText('UPAA3');
    expect(screen.getAllByText('Na carteira')).toHaveLength(1);
  });

  it('lista vazia mostra a mensagem de vazio', async () => {
    impl = async () => response({ gainers: [] });
    render(<MarketToday positions={null} onSelectTicker={noop} />);
    await screen.findByText('Nenhuma ação em alta com liquidez hoje.');
  });

  it('erro mostra aviso isolado e "Tentar novamente" refaz o fetch', async () => {
    impl = async () => {
      throw new Error('falhou');
    };
    render(<MarketToday positions={[]} onSelectTicker={noop} />);
    await screen.findByRole('alert');
    impl = async () => response();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getByText('UPAA3')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lista aparece antes dos minigráficos; cada um entra com sua cor e o sem histórico vira traço', async () => {
    impl = async () => response({ gainers: [q('UPAA3', 4), q('DNBB4', -1), q('SEMH3', 1)] });
    histories = {
      '^BVSP': hist('^BVSP', [170000, 176800], { changePercent: 1.2 }),
      UPAA3: hist('UPAA3', [10, 12]),
      DNBB4: hist('DNBB4', [10, 8]),
    };
    let open!: () => void;
    historyGate = new Promise((r) => (open = r));
    render(<MarketToday positions={[]} onSelectTicker={noop} />);
    await screen.findByText('UPAA3');
    expect(screen.getAllByLabelText('Carregando gráfico').length).toBeGreaterThan(0);
    open();

    await screen.findByRole('img', { name: 'UPAA3: alta no último mês' });
    const up = screen.getByRole('img', { name: 'UPAA3: alta no último mês' });
    expect(up.getAttribute('class')).toContain('vw-spark--up');
    const down = await screen.findByRole('img', { name: 'DNBB4: baixa no último mês' });
    expect(down.getAttribute('class')).toContain('vw-spark--down');
    await waitFor(() => expect(screen.getByTitle('Sem histórico de preço')).toBeTruthy());
    // A linha sem histórico continua lá, com preço e variação.
    expect(screen.getByText('SEMH3')).toBeTruthy();
  });

  it('Ibovespa no topo: pontos, variação do dia e minigráfico; clique abre o gráfico', async () => {
    impl = async () => response();
    histories = { '^BVSP': hist('^BVSP', [170000, 176799.84], { changePercent: 1.2 }) };
    const onSelect = vi.fn();
    render(<MarketToday positions={[]} onSelectTicker={onSelect} />);
    await screen.findByText('176.800 pts');
    expect(screen.getByText('+1,20%')).toBeTruthy();
    await screen.findByRole('img', { name: '^BVSP: alta no último mês' });
    fireEvent.click(screen.getByText('Ibovespa'));
    expect(onSelect).toHaveBeenCalledWith('^BVSP', 'Ibovespa');
  });

  it('clicar numa linha do mercado abre o gráfico daquele ativo', async () => {
    impl = async () => response();
    const onSelect = vi.fn();
    render(<MarketToday positions={[]} onSelectTicker={onSelect} />);
    fireEvent.click(await screen.findByText('UPAA3'));
    expect(onSelect).toHaveBeenCalledWith('UPAA3', 'Empresa UPAA3');
  });

  it('o mesmo ticker em duas listas pede o histórico 1 vez só', async () => {
    impl = async () => response({ gainers: [q('UPAA3', 4)], mostTraded: [q('UPAA3', 4)] });
    histories = { UPAA3: hist('UPAA3', [1, 2]) };
    render(<MarketToday positions={[]} onSelectTicker={noop} />);
    await screen.findByRole('img', { name: 'UPAA3: alta no último mês' });
    fireEvent.click(screen.getByRole('button', { name: 'Mais negociadas' }));
    await screen.findByRole('img', { name: 'UPAA3: alta no último mês' });
    expect(historyCalls.filter((t) => t === 'UPAA3')).toHaveLength(1);
  });
});
