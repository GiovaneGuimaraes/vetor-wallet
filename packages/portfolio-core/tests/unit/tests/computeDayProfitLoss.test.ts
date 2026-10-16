import { buildPositionMap } from 'src/buildPositionMap';
import { computeDayProfitLoss } from 'src/computeDayProfitLoss';
import { makeOp as op } from 'tests/unit/makeOp';

describe('computeDayProfitLoss', () => {
  it('matches manual calculation with known snapshots', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 200, 20)]);
    const quotes = new Map([['PETR4', 22]]);
    const previousCloses = new Map([['PETR4', 21]]);

    const result = computeDayProfitLoss(map, quotes, previousCloses, false);

    // 200 * (22 - 21) = 200; previousValue = 200 * 21 = 4200
    expect(result.dayProfitLoss).toBe(200);
    expect(result.dayProfitLossPct).toBeCloseTo((200 / 4200) * 100, 5);
  });

  it('returns null pct (not division by zero) when previous value is zero', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    const quotes = new Map([['PETR4', 35]]);
    const previousCloses = new Map([['PETR4', 0]]);

    const result = computeDayProfitLoss(map, quotes, previousCloses, false);

    expect(result.dayProfitLoss).toBe(3500);
    expect(result.dayProfitLossPct).toBeNull();
  });

  it('quotesFailed omitido vale false (calcula normalmente)', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 10, 30)]);
    const result = computeDayProfitLoss(map, new Map([['PETR4', 31]]), new Map([['PETR4', 30]]));

    expect(result.dayProfitLoss).toBe(10);
  });

  it('returns null when quotesFailed is true', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    const result = computeDayProfitLoss(map, new Map(), new Map([['PETR4', 30]]), true);

    expect(result.dayProfitLoss).toBeNull();
    expect(result.dayProfitLossPct).toBeNull();
  });

  it('returns null when the current quote for an active ticker is missing', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    const result = computeDayProfitLoss(map, new Map(), new Map([['PETR4', 30]]), false);

    expect(result.dayProfitLoss).toBeNull();
  });
});
