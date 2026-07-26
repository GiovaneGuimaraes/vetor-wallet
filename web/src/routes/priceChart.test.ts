import { describe, expect, it } from 'vitest';
import type { Operation, Position, QuoteSnapshot } from '@vetor-wallet/shared';
import {
  computeAveragePrice,
  computeFromDate,
  computePriceDomain,
  isPriceSeriesDown,
  selectDefaultTicker,
  snapshotDate,
} from './priceChart';

function op(partial: Partial<Operation>): Operation {
  return {
    id: 1,
    ticker: 'PETR4',
    type: 'BUY',
    quantity: 1,
    price: 1,
    date: '2026-01-01',
    created_at: '2026-01-01 00:00:00',
    ...partial,
  };
}

describe('computeAveragePrice', () => {
  it('devolve a média ponderada das BUYs remanescentes', () => {
    const operations: Operation[] = [
      op({ id: 1, type: 'BUY', quantity: 10, price: 10, date: '2026-01-01' }),
      op({ id: 2, type: 'BUY', quantity: 10, price: 20, date: '2026-01-05' }),
    ];
    // (10*10 + 10*20) / 20 = 15
    expect(computeAveragePrice(operations, 'PETR4')).toBe(15);
  });

  it('ignora operações de outros tickers', () => {
    const operations: Operation[] = [
      op({ id: 1, ticker: 'PETR4', type: 'BUY', quantity: 10, price: 10, date: '2026-01-01' }),
      op({ id: 2, ticker: 'VALE3', type: 'BUY', quantity: 10, price: 999, date: '2026-01-02' }),
    ];
    expect(computeAveragePrice(operations, 'PETR4')).toBe(10);
  });

  it('SELL reduz quantidade sem alterar o preço médio', () => {
    const operations: Operation[] = [
      op({ id: 1, type: 'BUY', quantity: 10, price: 10, date: '2026-01-01' }),
      op({ id: 2, type: 'SELL', quantity: 4, price: 50, date: '2026-01-02' }),
    ];
    expect(computeAveragePrice(operations, 'PETR4')).toBe(10);
  });

  it('devolve null quando a posição foi toda vendida', () => {
    const operations: Operation[] = [
      op({ id: 1, type: 'BUY', quantity: 10, price: 10, date: '2026-01-01' }),
      op({ id: 2, type: 'SELL', quantity: 10, price: 50, date: '2026-01-02' }),
    ];
    expect(computeAveragePrice(operations, 'PETR4')).toBeNull();
  });

  it('devolve null quando não há nenhuma BUY do ticker', () => {
    expect(computeAveragePrice([], 'PETR4')).toBeNull();
  });

  it('aplica na ordem correta de data mesmo recebendo o array fora de ordem (DESC)', () => {
    // GET /api/operations devolve DESC — a função precisa reordenar por date ASC
    // antes de aplicar, senão a SELL "aconteceria" antes da BUY que a cobre.
    const operations: Operation[] = [
      op({ id: 2, type: 'SELL', quantity: 5, price: 30, date: '2026-01-10' }),
      op({ id: 1, type: 'BUY', quantity: 10, price: 10, date: '2026-01-01' }),
    ];
    expect(computeAveragePrice(operations, 'PETR4')).toBe(10);
  });

  it('desempata por id quando a mesma data se repete', () => {
    const operations: Operation[] = [
      op({ id: 2, type: 'SELL', quantity: 10, price: 30, date: '2026-01-01' }),
      op({ id: 1, type: 'BUY', quantity: 10, price: 10, date: '2026-01-01' }),
    ];
    // id 1 (BUY) aplicado antes do id 2 (SELL) por desempate — posição zera.
    expect(computeAveragePrice(operations, 'PETR4')).toBeNull();
  });
});

function pos(partial: Partial<Position>): Position {
  return {
    ticker: 'PETR4',
    quantity: 1,
    avgPrice: 1,
    invested: 1,
    currentPrice: 1,
    currentValue: 1,
    profitLoss: 0,
    profitLossPct: 0,
    allocationPct: 0,
    ...partial,
  };
}

describe('selectDefaultTicker', () => {
  it('devolve null para lista vazia', () => {
    expect(selectDefaultTicker([])).toBeNull();
  });

  it('escolhe a maior alocação', () => {
    const positions = [
      pos({ ticker: 'A', allocationPct: 10 }),
      pos({ ticker: 'B', allocationPct: 70 }),
      pos({ ticker: 'C', allocationPct: 20 }),
    ];
    expect(selectDefaultTicker(positions)).toBe('B');
  });

  it('posições com allocationPct nulo nunca vencem uma conhecida', () => {
    const positions = [
      pos({ ticker: 'A', allocationPct: null }),
      pos({ ticker: 'B', allocationPct: 5 }),
    ];
    expect(selectDefaultTicker(positions)).toBe('B');
  });

  it('todas nulas: primeira da lista vence', () => {
    const positions = [
      pos({ ticker: 'A', allocationPct: null }),
      pos({ ticker: 'B', allocationPct: null }),
    ];
    expect(selectDefaultTicker(positions)).toBe('A');
  });
});

describe('computeFromDate', () => {
  it('subtrai os dias em UTC', () => {
    const ref = new Date('2026-07-25T12:00:00Z');
    expect(computeFromDate(30, ref)).toBe('2026-06-25');
  });

  it('0 dias devolve a própria data de referência', () => {
    const ref = new Date('2026-07-25T00:00:00Z');
    expect(computeFromDate(0, ref)).toBe('2026-07-25');
  });
});

describe('snapshotDate', () => {
  it('extrai a data de um captured_at com hora', () => {
    expect(snapshotDate('2026-07-20 10:00:00')).toBe('2026-07-20');
  });
});

describe('computePriceDomain', () => {
  it('inclui o preço médio no domínio mesmo fora do range dos fechamentos', () => {
    const domain = computePriceDomain([10, 12, 11], 20);
    expect(domain.max).toBeGreaterThanOrEqual(20);
  });

  it('sem preço médio, usa o primeiro fechamento como baseline (já incluso)', () => {
    const domain = computePriceDomain([10, 12, 8], null);
    expect(domain.min).toBeLessThanOrEqual(8);
    expect(domain.max).toBeGreaterThanOrEqual(12);
  });

  it('série vazia sem preço médio não quebra (baseline 0)', () => {
    const domain = computePriceDomain([], null);
    expect(Number.isFinite(domain.min)).toBe(true);
    expect(Number.isFinite(domain.max)).toBe(true);
  });
});

function snap(price: number, capturedAt: string): QuoteSnapshot {
  return { id: 1, ticker: 'PETR4', price, captured_at: capturedAt };
}

describe('isPriceSeriesDown', () => {
  it('false para 0 ou 1 ponto', () => {
    expect(isPriceSeriesDown([])).toBe(false);
    expect(isPriceSeriesDown([snap(10, '2026-01-01 00:00:00')])).toBe(false);
  });

  it('true quando o último preço é menor que o primeiro', () => {
    expect(
      isPriceSeriesDown([snap(10, '2026-01-01 00:00:00'), snap(8, '2026-01-02 00:00:00')]),
    ).toBe(true);
  });

  it('false quando o último preço é igual ou maior', () => {
    expect(
      isPriceSeriesDown([snap(10, '2026-01-01 00:00:00'), snap(10, '2026-01-02 00:00:00')]),
    ).toBe(false);
  });
});
