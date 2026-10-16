import { buildPositionMap } from 'src/buildPositionMap';
import { wouldExceedPosition } from 'src/wouldExceedPosition';
import { makeOp as op } from 'tests/unit/makeOp';

describe('wouldExceedPosition', () => {
  it('returns true when sell quantity exceeds current position', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 50, 30)]);
    expect(wouldExceedPosition(map, 'PETR4', 100)).toBe(true);
  });

  it('returns false when sell quantity is within current position', () => {
    const map = buildPositionMap([op('PETR4', 'BUY', 100, 30)]);
    expect(wouldExceedPosition(map, 'PETR4', 100)).toBe(false);
  });

  it('returns true for any positive sell on a ticker with no position', () => {
    const map = buildPositionMap([]);
    expect(wouldExceedPosition(map, 'PETR4', 1)).toBe(true);
  });
});
