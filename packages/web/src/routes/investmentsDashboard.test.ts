import { describe, expect, it } from 'vitest';
import type {
  FixedIncomePosition,
  FixedIncomeSummary,
  PortfolioSummary,
} from '@vetor-wallet/shared';
import { computeStockTotals } from './homeMetrics';
import {
  buildAllocation,
  buildInvestmentsOverview,
  nodeValue,
  upcomingMaturities,
} from './investmentsDashboard';

function makeSummary(overrides: Partial<PortfolioSummary> = {}): PortfolioSummary {
  return {
    totalInvested: 1000,
    totalCurrentValue: 1200,
    positions: [],
    ...overrides,
  } as PortfolioSummary;
}

function makeFixedIncomeSummary(overrides: Partial<FixedIncomeSummary> = {}): FixedIncomeSummary {
  return { totalInvested: 500, totalCurrent: 550, ...overrides };
}

function makePosition(overrides: Partial<FixedIncomePosition> = {}): FixedIncomePosition {
  return {
    id: 1,
    user_id: 1,
    name: 'CDB Teste',
    kind: 'CDB',
    institution: '',
    invested_amount: 100,
    invested_at: '2026-01-01',
    maturity_date: null,
    rate_type: 'PRE',
    rate: 10,
    current_value: null,
    current_value_date: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as FixedIncomePosition;
}

describe('nodeValue', () => {
  // Teste-trava (ver prompt da fatia c3): o card de Ações tem que usar
  // EXATAMENTE `computeStockTotals(...).current` — vindo do ShellContext,
  // nunca um segundo cálculo. Se alguém reimplementar a soma de Ações aqui
  // (ex.: somar `invested` em vez de `current`, ou ignorar uma carteira),
  // este teste quebra porque compara contra a função de origem, não contra
  // um número fixo.
  it('acoes é sempre computeStockTotals([walletSummary]).current, nunca um recálculo', () => {
    const summary = makeSummary({ totalInvested: 7777, totalCurrentValue: 8888 });
    const stockTotals = computeStockTotals([summary]);

    const value = nodeValue('acoes', { stockTotals, fixedIncomeSummary: null });

    expect(value).toBe(stockTotals.current);
    expect(value).toBe(8888);
  });

  it('acoes reflete quotesUnavailable (fallback para investido) igual a computeStockTotals', () => {
    const summary = makeSummary({ totalInvested: 321, totalCurrentValue: null });
    const stockTotals = computeStockTotals([summary]);

    expect(nodeValue('acoes', { stockTotals, fixedIncomeSummary: null })).toBe(stockTotals.current);
    expect(nodeValue('acoes', { stockTotals, fixedIncomeSummary: null })).toBe(321);
  });

  it('renda-fixa usa o totalCurrent do resumo quando disponível', () => {
    const stockTotals = computeStockTotals([]);
    const summary = makeFixedIncomeSummary({ totalCurrent: 1234.5 });

    expect(nodeValue('renda-fixa', { stockTotals, fixedIncomeSummary: summary })).toBe(1234.5);
  });

  it('renda-fixa é null enquanto o resumo não carregou ou falhou', () => {
    const stockTotals = computeStockTotals([]);
    expect(nodeValue('renda-fixa', { stockTotals, fixedIncomeSummary: null })).toBeNull();
  });

  it('renda-fixa soma manual + conexão bancária em centavos (T-091d, fatia d2)', () => {
    const stockTotals = computeStockTotals([]);
    const summary = makeFixedIncomeSummary({ totalCurrent: 0.1 });
    expect(
      nodeValue('renda-fixa', {
        stockTotals,
        fixedIncomeSummary: summary,
        pluggyFixedIncomeCents: 20,
      })
    ).toBe(0.3);
  });

  it('renda-fixa sem o resumo manual fica null mesmo com a conexão respondendo', () => {
    const stockTotals = computeStockTotals([]);
    expect(
      nodeValue('renda-fixa', {
        stockTotals,
        fixedIncomeSummary: null,
        pluggyFixedIncomeCents: 500,
      })
    ).toBeNull();
  });

  it('cripto é sempre null (comingSoon, sem dado ligado)', () => {
    const stockTotals = computeStockTotals([makeSummary()]);
    const summary = makeFixedIncomeSummary();
    expect(nodeValue('cripto', { stockTotals, fixedIncomeSummary: summary })).toBeNull();
  });

  it('chave desconhecida é null', () => {
    const stockTotals = computeStockTotals([]);
    expect(nodeValue('metas', { stockTotals, fixedIncomeSummary: null })).toBeNull();
  });
});

describe('buildInvestmentsOverview', () => {
  it('soma Ações + Renda Fixa em centavos inteiros', () => {
    const stockTotals = computeStockTotals([
      makeSummary({ totalInvested: 100, totalCurrentValue: 150.5 }),
    ]);
    const fixedIncomeSummary = makeFixedIncomeSummary({ totalCurrent: 49.5 });

    const overview = buildInvestmentsOverview(stockTotals, fixedIncomeSummary);

    expect(overview.stockCurrentCents).toBe(15050);
    expect(overview.fixedIncomeCurrentCents).toBe(4950);
    expect(overview.totalCurrentCents).toBe(20000);
    expect(overview.fixedIncomeAvailable).toBe(true);
  });

  it('resumo de Renda Fixa indisponível entra como 0 na soma, não derruba o total de Ações', () => {
    const stockTotals = computeStockTotals([
      makeSummary({ totalInvested: 100, totalCurrentValue: 150 }),
    ]);

    const overview = buildInvestmentsOverview(stockTotals, null);

    expect(overview.fixedIncomeAvailable).toBe(false);
    expect(overview.fixedIncomeCurrentCents).toBe(0);
    expect(overview.stockCurrentCents).toBe(15000);
    expect(overview.totalCurrentCents).toBe(15000);
  });

  it('soma a RF da conexão bancária à manual e informa a parte de cada fonte (fatia d2)', () => {
    const stockTotals = computeStockTotals([
      makeSummary({ totalInvested: 100, totalCurrentValue: 100 }),
    ]);

    const overview = buildInvestmentsOverview(
      stockTotals,
      makeFixedIncomeSummary({ totalCurrent: 50 }),
      2500
    );

    expect(overview.fixedIncomeCurrentCents).toBe(7500);
    expect(overview.fixedIncomePluggyCents).toBe(2500);
    expect(overview.totalCurrentCents).toBe(17500);
  });

  it('sem o resumo manual, a parte da conexão não entra (RF inteira indisponível)', () => {
    const overview = buildInvestmentsOverview(computeStockTotals([]), null, 2500);

    expect(overview.fixedIncomePluggyCents).toBe(0);
    expect(overview.fixedIncomeCurrentCents).toBe(0);
    expect(overview.totalCurrentCents).toBe(0);
  });
});

describe('buildAllocation', () => {
  it('calcula o percentual de cada classe sobre o total', () => {
    const overview = buildInvestmentsOverview(
      computeStockTotals([makeSummary({ totalInvested: 0, totalCurrentValue: 750 })]),
      makeFixedIncomeSummary({ totalCurrent: 250 })
    );

    const allocation = buildAllocation(overview);

    expect(allocation).toEqual([
      { key: 'acoes', label: 'Ações', cents: 75000, percent: 75 },
      { key: 'renda-fixa', label: 'Renda Fixa', cents: 25000, percent: 25 },
    ]);
  });

  it('total zero não produz NaN/Infinity — percentuais zerados', () => {
    const overview = buildInvestmentsOverview(computeStockTotals([]), null);
    const allocation = buildAllocation(overview);

    for (const slice of allocation) {
      expect(Number.isFinite(slice.percent)).toBe(true);
      expect(slice.percent).toBe(0);
    }
  });
});

describe('upcomingMaturities', () => {
  it('ordena por vencimento mais próximo e limita a 3, ignorando liquidez diária', () => {
    const positions = [
      makePosition({ id: 1, maturity_date: null }),
      makePosition({ id: 2, maturity_date: '2027-01-01' }),
      makePosition({ id: 3, maturity_date: '2026-11-01' }),
      makePosition({ id: 4, maturity_date: '2026-12-01' }),
      makePosition({ id: 5, maturity_date: '2026-10-20' }),
    ];

    const result = upcomingMaturities(positions);

    expect(result.map((p) => p.id)).toEqual([5, 3, 4]);
  });

  it('respeita o limite passado', () => {
    const positions = [
      makePosition({ id: 1, maturity_date: '2026-11-01' }),
      makePosition({ id: 2, maturity_date: '2026-12-01' }),
    ];

    expect(upcomingMaturities(positions, 1).map((p) => p.id)).toEqual([1]);
  });

  it('lista vazia quando só há posições de liquidez diária', () => {
    const positions = [makePosition({ id: 1, maturity_date: null })];
    expect(upcomingMaturities(positions)).toEqual([]);
  });
});
