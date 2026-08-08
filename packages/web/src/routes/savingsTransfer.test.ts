import { describe, it, expect } from 'vitest';
import type { SavingsEntry } from '@vetor-wallet/shared';
import {
  computeFreeBalance,
  computeReservedByGoal,
  computeReservedTotal,
  isTransferLeg,
  validateTransfer,
} from './savingsTransfer';

let seq = 0;
function entry(partial: Partial<SavingsEntry>): SavingsEntry {
  seq += 1;
  return {
    id: seq,
    user_id: 1,
    type: 'DEPOSIT',
    amount: 0,
    date: '2026-01-01',
    note: '',
    created_at: '2026-01-01 00:00:00',
    goal_id: null,
    transfer_group: null,
    ...partial,
  };
}

describe('computeReservedByGoal', () => {
  it('is empty without entries', () => {
    expect(computeReservedByGoal([]).size).toBe(0);
  });

  it('ignores unlinked entries', () => {
    expect(computeReservedByGoal([entry({ amount: 500 })]).size).toBe(0);
  });

  it('nets DEPOSIT minus WITHDRAW per goal', () => {
    const reserved = computeReservedByGoal([
      entry({ amount: 300, goal_id: 1 }),
      entry({ type: 'WITHDRAW', amount: 100, goal_id: 1 }),
      entry({ amount: 50, goal_id: 2 }),
    ]);
    expect(reserved.get(1)).toBe(200);
    expect(reserved.get(2)).toBe(50);
  });

  it('floors each goal at 0', () => {
    const reserved = computeReservedByGoal([
      entry({ amount: 100, goal_id: 1 }),
      entry({ type: 'WITHDRAW', amount: 400, goal_id: 1 }),
    ]);
    expect(reserved.get(1)).toBe(0);
  });

  it('leaves YIELD out of the reserve', () => {
    const reserved = computeReservedByGoal([
      entry({ type: 'YIELD', amount: 90, goal_id: 1 }),
      entry({ amount: 10, goal_id: 1 }),
    ]);
    expect(reserved.get(1)).toBe(10);
  });

  it('nets in cents', () => {
    const reserved = computeReservedByGoal([
      entry({ amount: 0.1, goal_id: 7 }),
      entry({ amount: 0.2, goal_id: 7 }),
    ]);
    expect(reserved.get(7)).toBe(0.3);
  });
});

describe('computeReservedTotal', () => {
  it('sums the floored reserve of every goal', () => {
    expect(
      computeReservedTotal([
        entry({ amount: 300, goal_id: 1 }),
        entry({ type: 'WITHDRAW', amount: 500, goal_id: 1 }),
        entry({ amount: 120, goal_id: 2 }),
      ])
    ).toBe(120);
  });
});

describe('computeFreeBalance (paridade com o service do server)', () => {
  it('equals the balance when nothing is reserved', () => {
    expect(
      computeFreeBalance(1050, [entry({ amount: 1000 }), entry({ type: 'YIELD', amount: 50 })])
    ).toBe(1050);
  });

  it('subtracts the reserve of every goal', () => {
    expect(
      computeFreeBalance(1000, [entry({ amount: 100 }), entry({ amount: 900, goal_id: 1 })])
    ).toBe(100);
  });

  it('counts YIELD as free money', () => {
    expect(
      computeFreeBalance(525, [
        entry({ amount: 500, goal_id: 1 }),
        entry({ type: 'YIELD', amount: 25 }),
      ])
    ).toBe(25);
  });

  it('drops by X after a transfer pair, while the balance stays the same', () => {
    const before = [entry({ amount: 1000 })];
    const after = [
      ...before,
      entry({ type: 'WITHDRAW', amount: 400, transfer_group: 'g1' }),
      entry({ amount: 400, goal_id: 1, transfer_group: 'g1' }),
    ];
    expect(computeFreeBalance(1000, before)).toBe(1000);
    expect(computeFreeBalance(1000, after)).toBe(600);
  });

  it('can be negative on legacy ledgers', () => {
    expect(computeFreeBalance(40, [entry({ amount: 100, goal_id: 1 })])).toBe(-60);
  });

  it('is exact in cents', () => {
    expect(computeFreeBalance(0.3, [entry({ amount: 0.1 }), entry({ amount: 0.2 })])).toBe(0.3);
  });

  it('spreads across multiple goals', () => {
    expect(
      computeFreeBalance(1000, [
        entry({ amount: 1000 }),
        entry({ amount: 200, goal_id: 1 }),
        entry({ amount: 300, goal_id: 2 }),
        entry({ type: 'WITHDRAW', amount: 500 }),
      ])
    ).toBe(500);
  });
});

describe('validateTransfer', () => {
  it('requires a goal', () => {
    expect(validateTransfer('100', '', 1000).error).toMatch(/meta/i);
  });

  it('rejects an empty amount', () => {
    expect(validateTransfer('', '3', 1000).error).toMatch(/valor válido/i);
  });

  it('rejects zero', () => {
    expect(validateTransfer('0', '3', 1000).error).toMatch(/valor válido/i);
  });

  it('rejects a non-numeric amount', () => {
    expect(validateTransfer('abc', '3', 1000).error).toMatch(/valor válido/i);
  });

  it('accepts a comma decimal separator and returns the parsed amount', () => {
    const result = validateTransfer('10,50', '3', 1000);
    expect(result.error).toBeNull();
    expect(result.amount).toBe(10.5);
  });

  it('rejects a value above the free balance', () => {
    expect(validateTransfer('200', '3', 100).error).toMatch(/saldo livre/i);
  });

  it('accepts exactly the free balance, in cents', () => {
    const result = validateTransfer('0,30', '3', 0.1 + 0.2);
    expect(result.error).toBeNull();
    expect(result.amount).toBe(0.3);
  });

  it('rejects everything when the free balance is negative (legacy ledger)', () => {
    expect(validateTransfer('1', '3', -50).error).toMatch(/saldo livre/i);
  });

  it('returns the parsed amount for a valid transfer', () => {
    const result = validateTransfer('250', '9', 1000);
    expect(result.error).toBeNull();
    expect(result.amount).toBe(250);
  });
});

describe('isTransferLeg', () => {
  it('is true for an entry with a transfer group', () => {
    expect(isTransferLeg(entry({ transfer_group: 'abc-123' }))).toBe(true);
  });

  it('is false for a normal entry (null or absent)', () => {
    expect(isTransferLeg(entry({ transfer_group: null }))).toBe(false);
    expect(isTransferLeg(entry({ transfer_group: undefined }))).toBe(false);
  });

  it('is false for an empty string', () => {
    expect(isTransferLeg(entry({ transfer_group: '' }))).toBe(false);
  });
});
