import { describe, it, expect } from 'vitest';
import type { ExpenseEntry, Goal, PortfolioSummary } from '@vetor-wallet/shared';
import { computeGoalsSummary, computeMonthCashFlow, computeStockTotals, sumAmounts } from './homeMetrics';

function makeEntry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: 1,
    user_id: 1,
    description: 'Mercado',
    category: '',
    amount: 100,
    date: '2026-07-10',
    created_at: '2026-07-10',
    ...overrides,
  };
}

function makeSummary(overrides: Partial<PortfolioSummary> = {}): PortfolioSummary {
  return {
    positions: [],
    totalInvested: 0,
    totalCurrentValue: null,
    totalProfitLoss: null,
    totalProfitLossPct: null,
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 1,
    user_id: 1,
    name: 'Meta',
    target_amount: 0,
    current_amount: 0,
    created_at: '2026-01-01',
    ...overrides,
  };
}

describe('computeStockTotals', () => {
  it('retorna zeros e sem flag para lista vazia', () => {
    expect(computeStockTotals([])).toEqual({ invested: 0, current: 0, hasMissingQuote: false });
  });

  it('usa o valor investido como fallback quando a cotação é nula e sinaliza hasMissingQuote', () => {
    const result = computeStockTotals([makeSummary({ totalInvested: 1000, totalCurrentValue: null })]);
    expect(result).toEqual({ invested: 1000, current: 1000, hasMissingQuote: true });
  });

  it('soma carteiras mistas (com e sem cotação) e sinaliza a flag quando ao menos uma falha', () => {
    const result = computeStockTotals([
      makeSummary({ totalInvested: 1000, totalCurrentValue: 1200 }),
      makeSummary({ totalInvested: 500, totalCurrentValue: null }),
    ]);
    expect(result).toEqual({ invested: 1500, current: 1700, hasMissingQuote: true });
  });

  it('não sinaliza a flag quando todas as carteiras têm cotação', () => {
    const result = computeStockTotals([
      makeSummary({ totalInvested: 1000, totalCurrentValue: 1200 }),
      makeSummary({ totalInvested: 500, totalCurrentValue: 480 }),
    ]);
    expect(result).toEqual({ invested: 1500, current: 1680, hasMissingQuote: false });
  });
});

describe('sumAmounts', () => {
  it('retorna 0 para array vazio', () => {
    expect(sumAmounts([])).toBe(0);
  });

  it('soma os valores de amount normalmente', () => {
    expect(sumAmounts([{ amount: 100 }, { amount: 250.5 }, { amount: 10 }])).toBeCloseTo(360.5);
  });
});

describe('computeGoalsSummary', () => {
  it('retorna aggregatePct null e count 0 para array vazio', () => {
    expect(computeGoalsSummary([])).toEqual({
      count: 0,
      totalTarget: 0,
      totalCurrent: 0,
      aggregatePct: null,
    });
  });

  it('não divide por zero quando o alvo agregado é 0 (metas sem target) — aggregatePct fica null', () => {
    const result = computeGoalsSummary([makeGoal({ target_amount: 0, current_amount: 50 })]);
    expect(result.totalTarget).toBe(0);
    expect(result.aggregatePct).toBeNull();
    expect(result.count).toBe(1);
  });

  it('calcula o percentual agregado corretamente com múltiplas metas', () => {
    const result = computeGoalsSummary([
      makeGoal({ target_amount: 1000, current_amount: 500 }),
      makeGoal({ target_amount: 1000, current_amount: 250 }),
    ]);
    expect(result.totalTarget).toBe(2000);
    expect(result.totalCurrent).toBe(750);
    expect(result.aggregatePct).toBeCloseTo(37.5);
    expect(result.count).toBe(2);
  });

  it('permite current_amount > target_amount e reporta percentual acima de 100', () => {
    const result = computeGoalsSummary([makeGoal({ target_amount: 100, current_amount: 150 })]);
    expect(result.aggregatePct).toBeCloseTo(150);
  });
});

describe('computeMonthCashFlow', () => {
  it('sem lançamentos variáveis (array vazio), sobra real é igual à prevista', () => {
    const result = computeMonthCashFlow(5000, 3000, []);
    expect(result).toEqual({
      expensesTotal: 3000,
      estimatedBalance: 2000,
      realBalance: 2000,
      hasVariableEntries: true,
    });
  });

  it('com lançamentos variáveis, subtrai corretamente da sobra real mantendo a prevista', () => {
    const result = computeMonthCashFlow(5000, 3000, [makeEntry({ amount: 400 }), makeEntry({ amount: 100 })]);
    expect(result).toEqual({
      expensesTotal: 3500,
      estimatedBalance: 2000,
      realBalance: 1500,
      hasVariableEntries: true,
    });
  });

  it('quando a busca de lançamentos falha (null), cai para a estimativa e sinaliza hasVariableEntries=false', () => {
    const result = computeMonthCashFlow(5000, 3000, null);
    expect(result).toEqual({
      expensesTotal: 3000,
      estimatedBalance: 2000,
      realBalance: 2000,
      hasVariableEntries: false,
    });
  });

  it('nunca retorna NaN mesmo com renda e fixas zeradas', () => {
    const result = computeMonthCashFlow(0, 0, null);
    expect(Number.isNaN(result.realBalance)).toBe(false);
    expect(Number.isNaN(result.estimatedBalance)).toBe(false);
  });
});
