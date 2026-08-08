import { describe, it, expect } from 'vitest';
import {
  computeBalance,
  computeFreeBalance,
  computeReservedTotal,
  pickTransferLegs,
  sumReservedByGoal,
  toCents,
  type SavingsBalanceEntry,
} from './savings';

function entry(
  type: SavingsBalanceEntry['type'],
  amount: number,
  goal_id: number | null = null
): SavingsBalanceEntry {
  return { type, amount, goal_id };
}

describe('pickTransferLegs (T-052)', () => {
  it('returns the withdraw/deposit rows when both are present', () => {
    const rows = [
      { id: 1, type: 'WITHDRAW' },
      { id: 2, type: 'DEPOSIT' },
    ];
    const { withdraw, deposit } = pickTransferLegs(rows, 1, 2);
    expect(withdraw).toEqual({ id: 1, type: 'WITHDRAW' });
    expect(deposit).toEqual({ id: 2, type: 'DEPOSIT' });
  });

  it('throws when the withdraw leg is missing', () => {
    const rows = [{ id: 2, type: 'DEPOSIT' }];
    expect(() => pickTransferLegs(rows, 1, 2)).toThrow('transferência gravada sem as duas pernas');
  });

  it('throws when the deposit leg is missing', () => {
    const rows = [{ id: 1, type: 'WITHDRAW' }];
    expect(() => pickTransferLegs(rows, 1, 2)).toThrow('transferência gravada sem as duas pernas');
  });

  it('throws when both legs are missing', () => {
    expect(() => pickTransferLegs([], 1, 2)).toThrow('transferência gravada sem as duas pernas');
  });
});

describe('toCents', () => {
  it('converts reais to integer cents', () => {
    expect(toCents(10)).toBe(1000);
    expect(toCents(0.1)).toBe(10);
    expect(toCents(175.5)).toBe(17550);
  });

  it('kills float noise (0.1 + 0.2)', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe('computeBalance', () => {
  it('is DEPOSIT + YIELD - WITHDRAW', () => {
    expect(
      computeBalance([entry('DEPOSIT', 1000), entry('YIELD', 50), entry('WITHDRAW', 200)])
    ).toBe(850);
  });

  it('is 0 for an empty ledger', () => {
    expect(computeBalance([])).toBe(0);
  });

  it('sums cent-sized amounts without float drift', () => {
    expect(computeBalance([entry('DEPOSIT', 0.1), entry('DEPOSIT', 0.2)])).toBe(0.3);
  });
});

describe('sumReservedByGoal', () => {
  it('returns an empty map for an empty ledger', () => {
    expect(sumReservedByGoal([]).size).toBe(0);
  });

  it('ignores entries without a goal link', () => {
    expect(sumReservedByGoal([entry('DEPOSIT', 500)]).size).toBe(0);
  });

  it('nets DEPOSIT minus WITHDRAW per goal', () => {
    const reserved = sumReservedByGoal([
      entry('DEPOSIT', 300, 1),
      entry('WITHDRAW', 100, 1),
      entry('DEPOSIT', 50, 2),
    ]);
    expect(reserved.get(1)).toBe(200);
    expect(reserved.get(2)).toBe(50);
  });

  it('floors each goal at 0 instead of leaking a negative reserve', () => {
    const reserved = sumReservedByGoal([
      entry('DEPOSIT', 100, 1),
      entry('WITHDRAW', 400, 1),
      entry('DEPOSIT', 80, 2),
    ]);
    expect(reserved.get(1)).toBe(0);
    expect(reserved.get(2)).toBe(80);
  });

  it('leaves YIELD out of the reserved amount (it cannot be linked — T-024)', () => {
    // Um YIELD com goal_id não deveria existir (o server rejeita), mas se um
    // dado legado tiver, ele não vira reserva.
    const reserved = sumReservedByGoal([entry('YIELD', 90, 1), entry('DEPOSIT', 10, 1)]);
    expect(reserved.get(1)).toBe(10);
  });

  it('nets in cents (0.1 + 0.2 does not become 0.30000000000000004)', () => {
    const reserved = sumReservedByGoal([entry('DEPOSIT', 0.1, 7), entry('DEPOSIT', 0.2, 7)]);
    expect(reserved.get(7)).toBe(0.3);
  });
});

describe('computeReservedTotal', () => {
  it('is 0 without linked entries', () => {
    expect(computeReservedTotal([entry('DEPOSIT', 1000), entry('YIELD', 5)])).toBe(0);
  });

  it('sums the floored reserve of every goal', () => {
    expect(
      computeReservedTotal([
        entry('DEPOSIT', 300, 1),
        entry('WITHDRAW', 500, 1), // meta 1 no piso 0, não -200
        entry('DEPOSIT', 120, 2),
      ])
    ).toBe(120);
  });
});

describe('computeFreeBalance', () => {
  it('equals the balance when nothing is reserved', () => {
    expect(computeFreeBalance([entry('DEPOSIT', 1000), entry('YIELD', 50)])).toBe(1050);
  });

  it('subtracts the reserve of every goal', () => {
    // 1000 no saldo, 900 reservados na meta A → 100 livres.
    expect(computeFreeBalance([entry('DEPOSIT', 100), entry('DEPOSIT', 900, 1)])).toBe(100);
  });

  it('counts YIELD as free money', () => {
    expect(computeFreeBalance([entry('DEPOSIT', 500, 1), entry('YIELD', 25)])).toBe(25);
  });

  it('handles a transfer pair as net zero on the balance and -X on the free balance', () => {
    const before = [entry('DEPOSIT', 1000)];
    const after = [...before, entry('WITHDRAW', 400), entry('DEPOSIT', 400, 1)];
    expect(computeBalance(after)).toBe(computeBalance(before));
    expect(computeFreeBalance(after)).toBe(600);
  });

  it('can be negative on legacy ledgers (caller applies max(0, …))', () => {
    // Aporte vinculado antes da T-041 + retirada avulsa: reserva > saldo.
    expect(computeFreeBalance([entry('DEPOSIT', 100, 1), entry('WITHDRAW', 60)])).toBe(-60);
  });

  it('is exact in cents so transferring the whole free balance is allowed', () => {
    const entries = [entry('DEPOSIT', 0.1), entry('DEPOSIT', 0.2)];
    const free = computeFreeBalance(entries);
    expect(toCents(free)).toBe(30);
    expect(toCents(0.3) <= toCents(free)).toBe(true);
  });

  it('spreads across multiple goals', () => {
    expect(
      computeFreeBalance([
        entry('DEPOSIT', 1000),
        entry('DEPOSIT', 200, 1),
        entry('DEPOSIT', 300, 2),
        entry('WITHDRAW', 500),
      ])
    ).toBe(500);
  });
});
