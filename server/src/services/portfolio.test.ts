import { describe, it, expect } from 'vitest';
import { buildPositionMap, buildPortfolioSummary } from './portfolio';
import type { Operation } from '../types';

function op(
  ticker: string,
  type: 'BUY' | 'SELL',
  quantity: number,
  price: number,
  id = 1,
): Operation {
  return { id, ticker, type, quantity, price, date: '2024-01-01', created_at: '2024-01-01' };
}

// ── buildPositionMap ─────────────────────────────────────────────────────────

describe('buildPositionMap', () => {
  it('single buy sets quantity and avgPrice', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    expect(map.get('PETR4')).toEqual({ quantity: 100, avgPrice: 30 });
  });

  it('multiple buys compute weighted average price', () => {
    // 100 @ 30 + 100 @ 40 → avgPrice = 35
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30), op('PETR4', 'BUY', 100, 40)]);
    expect(map.get('PETR4')).toEqual({ quantity: 200, avgPrice: 35 });
  });

  it('partial sell reduces quantity, keeps avgPrice', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30), op('PETR4', 'SELL', 40, 50)]);
    expect(map.get('PETR4')).toEqual({ quantity: 60, avgPrice: 30 });
  });

  it('full sell zeroes quantity', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30), op('PETR4', 'SELL', 100, 50)]);
    expect(map.get('PETR4')).toEqual({ quantity: 0, avgPrice: 30 });
  });

  it('selling more than held truncates to zero (known edge case — no negative positions)', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 50, 30), op('PETR4', 'SELL', 200, 50)]);
    expect(map.get('PETR4')!.quantity).toBe(0);
  });

  it('multiple tickers are tracked independently', () => {
    const map = buildPositionMap([
      op('PETR4', 'BUY', 100, 30),
      op('VALE3', 'BUY', 50, 80),
      op('PETR4', 'SELL', 30, 35),
    ]);
    expect(map.get('PETR4')).toEqual({ quantity: 70, avgPrice: 30 });
    expect(map.get('VALE3')).toEqual({ quantity: 50, avgPrice: 80 });
  });

  it('empty ops returns empty map', () => {
    expect(buildPositionMap([])).toEqual(new Map());
  });

  it('avgPrice resets to 0 when quantity would be 0 on a buy (defensive)', () => {
    // quantity=0 after a buy is contrived but the division guard should fire
    const map = buildPositionMap([op('PETR4', 'BUY', 0, 30)]);
    expect(map.get('PETR4')).toEqual({ quantity: 0, avgPrice: 0 });
  });
});

// ── buildPortfolioSummary ────────────────────────────────────────────────────

describe('buildPortfolioSummary', () => {
  it('computes invested, currentValue and P&L when quote is available', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    const quotes = new Map([['PETR4', 35]]);
    const summary = buildPortfolioSummary(map, quotes);

    const pos = summary.positions[0];
    expect(pos.invested).toBe(3000);
    expect(pos.currentValue).toBe(3500);
    expect(pos.profitLoss).toBe(500);
    expect(pos.profitLossPct).toBeCloseTo(16.667, 2);

    expect(summary.totalInvested).toBe(3000);
    expect(summary.totalCurrentValue).toBe(3500);
    expect(summary.totalProfitLoss).toBe(500);
    expect(summary.totalProfitLossPct).toBeCloseTo(16.667, 2);
  });

  it('currentValue and P&L are null when quote is missing', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    const summary = buildPortfolioSummary(map, new Map());

    expect(summary.positions[0].currentValue).toBeNull();
    expect(summary.positions[0].profitLoss).toBeNull();
    expect(summary.totalCurrentValue).toBeNull();
    expect(summary.totalProfitLoss).toBeNull();
  });

  it('totalCurrentValue is null when any ticker is missing a quote', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30), op('VALE3', 'BUY', 50, 80)]);
    // Only PETR4 has a quote
    const quotes = new Map([['PETR4', 35]]);
    const summary = buildPortfolioSummary(map, quotes);

    expect(summary.totalCurrentValue).toBeNull();
  });

  it('excludes tickers with zero quantity from positions', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30), op('PETR4', 'SELL', 100, 50)]);
    const summary = buildPortfolioSummary(map, new Map());
    expect(summary.positions).toHaveLength(0);
    expect(summary.totalInvested).toBe(0);
  });

  it('allocationPct sums to 100 when all quotes are available', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30), op('VALE3', 'BUY', 50, 80)]);
    const quotes = new Map([
      ['PETR4', 35],
      ['VALE3', 90],
    ]);
    const summary = buildPortfolioSummary(map, quotes);
    const total = summary.positions.reduce((acc, p) => acc + (p.allocationPct ?? 0), 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it('allocationPct falls back to invested when quotes are absent', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30), op('VALE3', 'BUY', 50, 80)]);
    const summary = buildPortfolioSummary(map, new Map());
    const total = summary.positions.reduce((acc, p) => acc + (p.allocationPct ?? 0), 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it('returns empty summary for empty position map', () => {
    const summary = buildPortfolioSummary(new Map(), new Map());
    expect(summary.positions).toHaveLength(0);
    expect(summary.totalInvested).toBe(0);
    expect(summary.totalCurrentValue).toBe(0);
    expect(summary.totalProfitLoss).toBe(0);
  });
});
