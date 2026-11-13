import { describe, it, expect } from 'vitest';
import {
  classifyTicker,
  buildDiversificationTips,
  computePortfolioStats,
  type DiversificationInput,
} from './diversificationInsights';
import type { Position } from '@vetor-wallet/shared';

function position(ticker: string, currentValue: number): Position {
  return {
    ticker,
    quantity: 1,
    avgPrice: currentValue,
    invested: currentValue,
    currentPrice: currentValue,
    currentValue,
    profitLoss: 0,
    profitLossPct: 0,
    allocationPct: null,
  };
}

describe('classifyTicker', () => {
  it('classifica ação (ON/PN) pelo sufixo 3-8', () => {
    expect(classifyTicker('PETR4')).toBe('ACAO');
    expect(classifyTicker('CPLE3')).toBe('ACAO');
    expect(classifyTicker('ITSA6')).toBe('ACAO');
  });

  it('classifica FII pelo sufixo 11', () => {
    expect(classifyTicker('HGLG11')).toBe('FII');
    expect(classifyTicker('MXRF11')).toBe('FII');
  });

  it('cai em OUTRO fora desses padrões', () => {
    expect(classifyTicker('XYZ1')).toBe('OUTRO');
    expect(classifyTicker('AB')).toBe('OUTRO');
  });
});

describe('computePortfolioStats', () => {
  it('degrada para o valor investido quando a cotação está indisponível (currentValue null)', () => {
    // Falha silenciosa da brapi (CLAUDE.md › "Falha silenciosa de cotações"):
    // currentValue null NÃO pode virar renda variável zerada.
    const semCotacao: Position = {
      ticker: 'PETR4',
      quantity: 11,
      avgPrice: 30,
      invested: 1000,
      currentPrice: null,
      currentValue: null,
      profitLoss: null,
      profitLossPct: null,
      allocationPct: null,
    };
    const stats = computePortfolioStats({ positions: [semCotacao], fixedIncomeCurrentCents: 0 });
    expect(stats.variableCents).toBe(100_000);
    expect(stats.acaoCents).toBe(100_000);
    expect(stats.biggestTicker).toBe('PETR4');
  });
});

describe('buildDiversificationTips', () => {
  it('não gera sugestão para patrimônio residual (abaixo do piso de ruído)', () => {
    const input: DiversificationInput = {
      positions: [position('PETR4', 50)],
      fixedIncomeCurrentCents: 0,
    };
    expect(buildDiversificationTips(input)).toEqual([]);
  });

  it('avisa sobre pouca renda fixa quando só há ações', () => {
    const input: DiversificationInput = {
      positions: [position('PETR4', 10000)],
      fixedIncomeCurrentCents: 0,
    };
    const tips = buildDiversificationTips(input);
    expect(tips.map((t) => t.id)).toContain('sem-renda-fixa');
  });

  it('não avisa sobre renda fixa quando ela já é >= 10% do total', () => {
    const input: DiversificationInput = {
      positions: [position('PETR4', 9000)],
      fixedIncomeCurrentCents: 100_000, // 90% em RF
    };
    const tips = buildDiversificationTips(input);
    expect(tips.map((t) => t.id)).not.toContain('sem-renda-fixa');
  });

  it('avisa sobre concentração quando um ativo passa de 40% da renda variável', () => {
    const input: DiversificationInput = {
      positions: [position('PETR4', 8000), position('VALE3', 1000), position('ITSA4', 1000)],
      fixedIncomeCurrentCents: 100_000,
    };
    const tips = buildDiversificationTips(input);
    expect(tips.map((t) => t.id)).toContain('concentracao');
  });

  it('não avisa sobre concentração quando bem distribuída entre ativos', () => {
    const input: DiversificationInput = {
      positions: [position('PETR4', 3400), position('VALE3', 3300), position('ITSA4', 3300)],
      fixedIncomeCurrentCents: 100_000,
    };
    const tips = buildDiversificationTips(input);
    expect(tips.map((t) => t.id)).not.toContain('concentracao');
  });

  it('sugere FII quando só há ações e nenhum FII', () => {
    const input: DiversificationInput = {
      positions: [position('PETR4', 3400), position('VALE3', 3300), position('ITSA4', 3300)],
      fixedIncomeCurrentCents: 100_000,
    };
    const tips = buildDiversificationTips(input);
    expect(tips.map((t) => t.id)).toContain('sem-fii');
  });

  it('não sugere FII quando já existe posição em FII', () => {
    const input: DiversificationInput = {
      positions: [position('PETR4', 5000), position('HGLG11', 5000)],
      fixedIncomeCurrentCents: 100_000,
    };
    const tips = buildDiversificationTips(input);
    expect(tips.map((t) => t.id)).not.toContain('sem-fii');
  });

  it('devolve o tip "diversificada" quando nenhum alerta dispara', () => {
    const input: DiversificationInput = {
      positions: [position('PETR4', 2500), position('VALE3', 2500), position('HGLG11', 2000)],
      fixedIncomeCurrentCents: 300_000,
    };
    const tips = buildDiversificationTips(input);
    expect(tips).toEqual([
      expect.objectContaining({ id: 'diversificada', level: 'ok' }),
    ]);
  });

  it('só avalia renda-fixa/concentração/FII quando há renda variável (RF pura não dispara nada)', () => {
    const input: DiversificationInput = {
      positions: [],
      fixedIncomeCurrentCents: 1_000_00,
    };
    const tips = buildDiversificationTips(input);
    expect(tips).toEqual([
      expect.objectContaining({ id: 'diversificada', level: 'ok' }),
    ]);
  });
});
