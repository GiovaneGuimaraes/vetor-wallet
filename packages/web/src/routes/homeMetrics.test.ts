import { describe, it, expect } from 'vitest';
import type { ExpenseEntry, Goal, IncomeEntry, PortfolioSummary } from '@vetor-wallet/shared';
import { computeGoalsSummary, computeMonthCashFlow, computeStockTotals, sumAmounts } from './homeMetrics';

function makeEntry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: 1,
    user_id: 1,
    description: 'Mercado',
    category: '',
    amount: 100,
    date: '2026-07-10',
    recurring_id: null,
    created_at: '2026-07-10',
    ...overrides,
  };
}

/** Renda variável do mês (T-036) — sem categoria e sem recorrência. */
function makeIncomeEntry(overrides: Partial<IncomeEntry> = {}): IncomeEntry {
  return {
    id: 1,
    user_id: 1,
    description: 'Freela',
    amount: 800,
    date: '2026-07-12',
    created_at: '2026-07-12',
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
  it('sem lançamentos variáveis (arrays vazios), sobra real é igual à prevista e as duas flags são true', () => {
    const result = computeMonthCashFlow(5000, 3000, [], []);
    expect(result).toEqual({
      incomeTotal: 5000,
      expensesTotal: 3000,
      estimatedBalance: 2000,
      realBalance: 2000,
      entriesLoaded: true,
      incomeEntriesLoaded: true,
    });
  });

  it('com despesas variáveis, subtrai corretamente da sobra real mantendo a prevista', () => {
    const result = computeMonthCashFlow(
      5000,
      3000,
      [makeEntry({ amount: 400 }), makeEntry({ amount: 100 })],
      [],
    );
    expect(result).toEqual({
      incomeTotal: 5000,
      expensesTotal: 3500,
      estimatedBalance: 2000,
      realBalance: 1500,
      entriesLoaded: true,
      incomeEntriesLoaded: true,
    });
  });

  it('quando a busca de despesas variáveis falha (null), cai para a estimativa e sinaliza entriesLoaded=false', () => {
    const result = computeMonthCashFlow(5000, 3000, null, []);
    expect(result).toEqual({
      incomeTotal: 5000,
      expensesTotal: 3000,
      estimatedBalance: 2000,
      realBalance: 2000,
      entriesLoaded: false,
      incomeEntriesLoaded: true,
    });
  });

  it('nunca retorna NaN mesmo com renda e fixas zeradas', () => {
    const result = computeMonthCashFlow(0, 0, null, null);
    expect(Number.isNaN(result.realBalance)).toBe(false);
    expect(Number.isNaN(result.estimatedBalance)).toBe(false);
    expect(Number.isNaN(result.incomeTotal)).toBe(false);
  });

  // ── T-036: rendas variáveis do mês ────────────────────────────────────────
  it('sem rendas variáveis (null), o resultado é numericamente idêntico ao pré-T-036', () => {
    const semRendas = computeMonthCashFlow(5000, 3000, [makeEntry({ amount: 500 })], null);
    const rendasVazias = computeMonthCashFlow(5000, 3000, [makeEntry({ amount: 500 })], []);

    expect(semRendas.incomeTotal).toBe(5000);
    expect(semRendas.expensesTotal).toBe(3500);
    expect(semRendas.estimatedBalance).toBe(2000);
    expect(semRendas.realBalance).toBe(1500);
    // Só a flag distingue os dois casos — os números são os mesmos.
    expect(semRendas.incomeEntriesLoaded).toBe(false);
    expect(rendasVazias.incomeEntriesLoaded).toBe(true);
    expect(rendasVazias.realBalance).toBe(semRendas.realBalance);
    expect(rendasVazias.incomeTotal).toBe(semRendas.incomeTotal);
  });

  it('com rendas variáveis, soma na renda do mês e na sobra real — sem mexer na prevista', () => {
    const result = computeMonthCashFlow(
      5000,
      3000,
      [makeEntry({ amount: 500 })],
      [makeIncomeEntry({ amount: 800 }), makeIncomeEntry({ id: 2, amount: 200 })],
    );
    expect(result).toEqual({
      incomeTotal: 6000,
      expensesTotal: 3500,
      // Prevista continua renda FIXA − fixas: renda avulsa não é previsível.
      estimatedBalance: 2000,
      realBalance: 2500,
      entriesLoaded: true,
      incomeEntriesLoaded: true,
    });
  });

  it('as duas falhas são independentes: despesas variáveis podem falhar e rendas variáveis não (e vice-versa)', () => {
    const soDespesasFalharam = computeMonthCashFlow(5000, 3000, null, [
      makeIncomeEntry({ amount: 800 }),
    ]);
    expect(soDespesasFalharam.incomeTotal).toBe(5800);
    expect(soDespesasFalharam.expensesTotal).toBe(3000);
    expect(soDespesasFalharam.realBalance).toBe(2800);
    expect(soDespesasFalharam.entriesLoaded).toBe(false);
    expect(soDespesasFalharam.incomeEntriesLoaded).toBe(true);

    const soRendasFalharam = computeMonthCashFlow(5000, 3000, [makeEntry({ amount: 500 })], null);
    expect(soRendasFalharam.incomeTotal).toBe(5000);
    expect(soRendasFalharam.expensesTotal).toBe(3500);
    expect(soRendasFalharam.realBalance).toBe(1500);
    expect(soRendasFalharam.entriesLoaded).toBe(true);
    expect(soRendasFalharam.incomeEntriesLoaded).toBe(false);
  });

  it('com as duas buscas falhando, cai para a estimativa sem NaN e com as duas flags false', () => {
    const result = computeMonthCashFlow(5000, 3000, null, null);
    expect(result).toEqual({
      incomeTotal: 5000,
      expensesTotal: 3000,
      estimatedBalance: 2000,
      realBalance: 2000,
      entriesLoaded: false,
      incomeEntriesLoaded: false,
    });
  });
});
