import { describe, it, expect } from 'vitest';
import {
  classifyTicker,
  computePortfolioStats,
  agentOpinionForNode,
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

describe('agentOpinionForNode', () => {
  it('não opina para patrimônio residual (abaixo do piso de ruído), em nenhum card', () => {
    const input: DiversificationInput = {
      positions: [position('PETR4', 50)],
      fixedIncomeCurrentCents: 0,
    };
    expect(agentOpinionForNode('acoes', input)).toBeNull();
    expect(agentOpinionForNode('renda-fixa', input)).toBeNull();
  });

  describe('card "acoes"', () => {
    it('não opina quando não há nenhuma posição de renda variável', () => {
      const input: DiversificationInput = { positions: [], fixedIncomeCurrentCents: 1_000_00 };
      expect(agentOpinionForNode('acoes', input)).toBeNull();
    });

    it('avisa concentração quando um ativo passa de 40% da renda variável', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 8000), position('VALE3', 1000), position('ITSA4', 1000)],
        fixedIncomeCurrentCents: 100_000,
      };
      const opinion = agentOpinionForNode('acoes', input)!;
      expect(opinion.level).toBe('warn');
      expect(opinion.message).toContain('PETR4');
    });

    it('avisa ausência de FII quando só há ações', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 3400), position('VALE3', 3300), position('ITSA4', 3300)],
        fixedIncomeCurrentCents: 100_000,
      };
      const opinion = agentOpinionForNode('acoes', input)!;
      expect(opinion.level).toBe('warn');
      expect(opinion.message).toMatch(/fundos imobiliários/i);
    });

    it('opina "ok" quando bem distribuída e sem concentração', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 2500), position('VALE3', 2500), position('HGLG11', 2000)],
        fixedIncomeCurrentCents: 300_000,
      };
      const opinion = agentOpinionForNode('acoes', input)!;
      expect(opinion.level).toBe('ok');
    });
  });

  describe('card "renda-fixa"', () => {
    it('avisa reserva baixa quando RF está abaixo de 10% do total', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 10000)],
        fixedIncomeCurrentCents: 0,
      };
      const opinion = agentOpinionForNode('renda-fixa', input)!;
      expect(opinion.level).toBe('warn');
      expect(opinion.message).toContain('0%');
    });

    it('opina "ok" quando RF já é >= 10% do total', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 9000)],
        fixedIncomeCurrentCents: 100_000,
      };
      const opinion = agentOpinionForNode('renda-fixa', input)!;
      expect(opinion.level).toBe('ok');
    });

    it('opina "ok" mesmo sem nenhuma posição de renda variável (RF pura), se o valor não é considerável', () => {
      const input: DiversificationInput = { positions: [], fixedIncomeCurrentCents: 1_000_00 };
      const opinion = agentOpinionForNode('renda-fixa', input)!;
      expect(opinion.level).toBe('ok');
      expect(opinion.message).toContain('100%');
    });

    it('sugere diversificar para renda variável quando RF > 80% E o valor é considerável (>= R$5.000)', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 100)], // R$ 100 em ações
        fixedIncomeCurrentCents: 10_000_00, // R$ 10.000 em RF, ~99% do total
      };
      const opinion = agentOpinionForNode('renda-fixa', input)!;
      expect(opinion.level).toBe('info');
      expect(opinion.message).toMatch(/renda variável/i);
      expect(opinion.message).toContain('R$');
    });

    it('sugere diversificar mesmo sem nenhuma posição de renda variável, se o valor em RF é considerável', () => {
      const input: DiversificationInput = {
        positions: [],
        fixedIncomeCurrentCents: 10_000_00, // R$ 10.000, 100% do total
      };
      const opinion = agentOpinionForNode('renda-fixa', input)!;
      expect(opinion.level).toBe('info');
    });

    it('não sugere diversificar quando RF está acima de 80% mas o valor absoluto ainda é pequeno', () => {
      const input: DiversificationInput = {
        positions: [],
        fixedIncomeCurrentCents: 200_00, // R$ 200 — acima do piso de ruído, abaixo do de "considerável"
      };
      const opinion = agentOpinionForNode('renda-fixa', input)!;
      expect(opinion.level).toBe('ok');
    });
  });
});
