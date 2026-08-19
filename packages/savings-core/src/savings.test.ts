import { describe, it, expect } from 'vitest';
import { computeBalance, toCents, type SavingsBalanceEntry } from './savings';

function entry(type: SavingsBalanceEntry['type'], amount: number): SavingsBalanceEntry {
  return { type, amount };
}

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

/**
 * T-091b1/T-091b2: Metas foi removida e o saldo livre passou a ser o saldo
 * inteiro. A etapa 2 apagou `savings_entries.goal_id` do banco, então a linha que
 * chega aqui não traz mais vínculo nenhum. O legado que **sobrou** é o
 * `transfer_group` (T-041): rótulo de procedência que a UI usa para o selo `⇄`,
 * e que não pode reservar nem descontar nada.
 */
describe('saldo livre = saldo, com dado legado de transferência (T-091b1/T-091b2)', () => {
  it('counts entries carrying a legacy transfer_group at full value', () => {
    // O campo não faz parte de `SavingsBalanceEntry`; a linha vinda do banco
    // ainda o traz, e precisa ser somada como qualquer outra.
    const ledger = [
      { type: 'DEPOSIT', amount: 100, transfer_group: 'grp-1' },
      { type: 'DEPOSIT', amount: 900, transfer_group: null },
      { type: 'WITHDRAW', amount: 300, transfer_group: 'grp-1' },
      { type: 'YIELD', amount: 25 },
    ] as unknown as SavingsBalanceEntry[];
    expect(computeBalance(ledger)).toBe(725);
  });

  it('does not discount a ledger made only of legacy pair legs', () => {
    const ledger = [
      { type: 'DEPOSIT', amount: 500, transfer_group: 'grp-1' },
      { type: 'DEPOSIT', amount: 500, transfer_group: 'grp-2' },
    ] as unknown as SavingsBalanceEntry[];
    expect(computeBalance(ledger)).toBe(1000);
  });

  it('stays exact in cents with legacy entries (0,10 + 0,20 = 0,30)', () => {
    const ledger = [
      { type: 'DEPOSIT', amount: 0.1, transfer_group: 'grp-3' },
      { type: 'DEPOSIT', amount: 0.2, transfer_group: 'grp-3' },
    ] as unknown as SavingsBalanceEntry[];
    expect(toCents(computeBalance(ledger))).toBe(30);
  });

  it('keeps a legacy transfer pair net zero on the balance', () => {
    // Par da T-041 (as duas pernas com o mesmo uuid): sem Metas ele é só um par
    // de lançamentos comuns que se anulam.
    const ledger = [
      { type: 'DEPOSIT', amount: 1000 },
      { type: 'WITHDRAW', amount: 400, transfer_group: 'grp-5' },
      { type: 'DEPOSIT', amount: 400, transfer_group: 'grp-5' },
    ] as unknown as SavingsBalanceEntry[];
    expect(computeBalance(ledger)).toBe(1000);
  });
});
