import { buildPositionMap } from 'src/buildPositionMap';
import { buildPortfolioSummary } from 'src/buildPortfolioSummary';
import { makeOp as op } from 'tests/unit/makeOp';

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

  it('allocationPct é null (não divisão por zero) quando a carteira inteira vale 0', () => {
    // Bonificação lançada a preço 0 e cotação 0: posição ativa, base 0.
    const map = buildPositionMap([op('PETR4', 'BUY', 10, 0)]);
    const summary = buildPortfolioSummary(map, new Map([['PETR4', 0]]));

    expect(summary.positions[0].allocationPct).toBeNull();
    expect(summary.positions[0].profitLossPct).toBeNull();
  });

  it('returns empty summary for empty position map', () => {
    const summary = buildPortfolioSummary(new Map(), new Map());
    expect(summary.positions).toHaveLength(0);
    expect(summary.totalInvested).toBe(0);
    expect(summary.totalCurrentValue).toBe(0);
    expect(summary.totalProfitLoss).toBe(0);
  });

  // ── quotesUnavailable (T-015: sinal explícito de falha na busca de cotações) ──

  it('sets quotesUnavailable=true when the quotes fetch failed', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    const summary = buildPortfolioSummary(map, new Map(), true);

    expect(summary.quotesUnavailable).toBe(true);
    expect(summary.positions[0].currentValue).toBeNull();
  });

  it('omits quotesUnavailable when the quotes fetch succeeded', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    const quotes = new Map([['PETR4', 35]]);
    const summary = buildPortfolioSummary(map, quotes, false);

    expect(summary.quotesUnavailable).toBeUndefined();
  });

  it('omits quotesUnavailable by default when the third argument is not passed', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    const summary = buildPortfolioSummary(map, new Map());

    expect(summary.quotesUnavailable).toBeUndefined();
  });

  // ── dayProfitLoss / dayProfitLossPct (T-016) ────────────────────────────────

  it('computes dayProfitLoss from known snapshots — quantity × (current - previousClose)', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    const quotes = new Map([['PETR4', 35]]);
    const previousCloses = new Map([['PETR4', 32]]);

    const summary = buildPortfolioSummary(map, quotes, false, previousCloses);

    // manual: 100 * (35 - 32) = 300; previousValue = 100 * 32 = 3200 → 9.375%
    expect(summary.dayProfitLoss).toBe(300);
    expect(summary.dayProfitLossPct).toBeCloseTo(9.375, 3);
  });

  it('aggregates dayProfitLoss across multiple tickers', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30), op('VALE3', 'BUY', 50, 80)]);
    const quotes = new Map([
      ['PETR4', 35],
      ['VALE3', 78],
    ]);
    const previousCloses = new Map([
      ['PETR4', 32],
      ['VALE3', 80],
    ]);

    const summary = buildPortfolioSummary(map, quotes, false, previousCloses);

    // PETR4: 100*(35-32)=300; VALE3: 50*(78-80)=-100 → total 200
    // previousValue = 100*32 + 50*80 = 3200 + 4000 = 7200 → 200/7200*100
    expect(summary.dayProfitLoss).toBe(200);
    expect(summary.dayProfitLossPct).toBeCloseTo((200 / 7200) * 100, 5);
  });

  it('dayProfitLoss is null when a ticker has no previous-close snapshot', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    const quotes = new Map([['PETR4', 35]]);

    const summary = buildPortfolioSummary(map, quotes, false, new Map());

    expect(summary.dayProfitLoss).toBeNull();
    expect(summary.dayProfitLossPct).toBeNull();
  });

  it('dayProfitLoss is null when quotes are unavailable, even with snapshots present', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    const previousCloses = new Map([['PETR4', 32]]);

    const summary = buildPortfolioSummary(map, new Map(), true, previousCloses);

    expect(summary.dayProfitLoss).toBeNull();
    expect(summary.dayProfitLossPct).toBeNull();
  });

  it('dayProfitLoss is null when there are no active tickers', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30), op('PETR4', 'SELL', 100, 50)]);
    const summary = buildPortfolioSummary(map, new Map(), false, new Map());

    expect(summary.dayProfitLoss).toBeNull();
    expect(summary.dayProfitLossPct).toBeNull();
  });

  it('defaults dayProfitLoss to null when previousCloses argument is omitted', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    const quotes = new Map([['PETR4', 35]]);
    const summary = buildPortfolioSummary(map, quotes);

    expect(summary.dayProfitLoss).toBeNull();
    expect(summary.dayProfitLossPct).toBeNull();
  });
});
