import { buildPositionMap } from 'src/buildPositionMap';
import { makeOp as op } from 'tests/unit/makeOp';

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

  it('selling more than held truncates to zero (defensive floor; routes reject this before it reaches here)', () => {
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
