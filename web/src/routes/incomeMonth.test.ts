import { describe, it, expect } from 'vitest';
import type { IncomeEntry, IncomeSource } from '@vetor-wallet/shared';
import { computeIncomeMonthTotals } from './incomeMonth';
import { currentMonthKey, shiftMonth } from './expenseMonth';

function makeSource(overrides: Partial<IncomeSource> = {}): IncomeSource {
  return {
    id: 1,
    user_id: 1,
    name: 'Salário',
    type: 'SALARIO',
    amount: 5000,
    created_at: '2026-01-01',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<IncomeEntry> = {}): IncomeEntry {
  return {
    id: 1,
    user_id: 1,
    description: 'Freela',
    amount: 800,
    date: `${currentMonthKey()}-10`,
    created_at: `${currentMonthKey()}-10`,
    ...overrides,
  };
}

describe('computeIncomeMonthTotals', () => {
  it('retorna zeros quando não há fontes fixas nem rendas do mês', () => {
    expect(computeIncomeMonthTotals([], [])).toEqual({ fixed: 0, variable: 0, total: 0 });
  });

  it('sem rendas variáveis, o total é só a soma das fontes fixas', () => {
    const totals = computeIncomeMonthTotals(
      [makeSource({ amount: 5000 }), makeSource({ id: 2, amount: 1200, type: 'FREELA' })],
      [],
    );
    expect(totals).toEqual({ fixed: 6200, variable: 0, total: 6200 });
  });

  it('soma fixas + variáveis no total do mês', () => {
    const totals = computeIncomeMonthTotals(
      [makeSource({ amount: 5000 })],
      [makeEntry({ amount: 800 }), makeEntry({ id: 2, amount: 150.5 })],
    );
    expect(totals.fixed).toBe(5000);
    expect(totals.variable).toBeCloseTo(950.5);
    expect(totals.total).toBeCloseTo(5950.5);
  });

  it('sem fontes fixas, o total é só a soma das rendas variáveis do mês', () => {
    const totals = computeIncomeMonthTotals([], [makeEntry({ amount: 300 })]);
    expect(totals).toEqual({ fixed: 0, variable: 300, total: 300 });
  });

  it('soma apenas os lançamentos recebidos — o filtro por mês é do server', () => {
    // A função não olha `date`: quem já veio na lista pertence ao mês exibido.
    // Este teste documenta o contrato (e usa mês relativo, nunca data fixa).
    const outroMes = shiftMonth(currentMonthKey(), -1);
    const totals = computeIncomeMonthTotals(
      [],
      [makeEntry({ amount: 100, date: `${outroMes}-05` })],
    );
    expect(totals.total).toBe(100);
  });
});
