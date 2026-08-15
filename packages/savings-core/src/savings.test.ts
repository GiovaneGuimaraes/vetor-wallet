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
 * T-091b1: Metas foi removida e o saldo livre passou a ser o saldo inteiro.
 * A etapa 2 (T-091b2) ainda não apagou `savings_entries.goal_id`, então bases
 * reais seguem tendo lançamentos com vínculo gravado — eles NÃO podem mais ser
 * descontados de nada.
 */
describe('saldo livre = saldo, com dado legado de meta (T-091b1)', () => {
  it('counts entries carrying a legacy goal_id at full value', () => {
    // O campo nem faz parte de `SavingsBalanceEntry` desde a T-091b1; a linha
    // vinda do banco ainda o traz, e precisa ser somada como qualquer outra.
    const ledger = [
      { type: 'DEPOSIT', amount: 100, goal_id: 7 },
      { type: 'DEPOSIT', amount: 900, goal_id: null },
      { type: 'WITHDRAW', amount: 300, goal_id: 7 },
      { type: 'YIELD', amount: 25 },
    ] as unknown as SavingsBalanceEntry[];
    // Antes da T-091b1 o "livre" aqui seria 725 (100 − 300 com piso 0 na meta 7
    // não reservava nada) contra um saldo de 725 — coincidência do exemplo;
    // o que importa é que hoje só existe UM número: o saldo.
    expect(computeBalance(ledger)).toBe(725);
  });

  it('does not discount a fully linked ledger', () => {
    const ledger = [
      { type: 'DEPOSIT', amount: 500, goal_id: 1 },
      { type: 'DEPOSIT', amount: 500, goal_id: 2 },
    ] as unknown as SavingsBalanceEntry[];
    expect(computeBalance(ledger)).toBe(1000);
  });

  it('stays exact in cents with linked entries (0,10 + 0,20 = 0,30)', () => {
    const ledger = [
      { type: 'DEPOSIT', amount: 0.1, goal_id: 3 },
      { type: 'DEPOSIT', amount: 0.2, goal_id: 3 },
    ] as unknown as SavingsBalanceEntry[];
    expect(toCents(computeBalance(ledger))).toBe(30);
  });

  it('keeps a legacy transfer pair net zero on the balance', () => {
    // Par da T-041 (WITHDRAW sem vínculo + DEPOSIT vinculado): sem Metas ele é
    // só um par de lançamentos comuns que se anulam.
    const ledger = [
      { type: 'DEPOSIT', amount: 1000 },
      { type: 'WITHDRAW', amount: 400 },
      { type: 'DEPOSIT', amount: 400, goal_id: 5 },
    ] as unknown as SavingsBalanceEntry[];
    expect(computeBalance(ledger)).toBe(1000);
  });
});
