import { describe, it, expect } from 'vitest';
import { answerPortfolioQuestion, PORTFOLIO_QUESTIONS } from './portfolioAssistant';
import type { DiversificationInput } from './diversificationInsights';
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

describe('PORTFOLIO_QUESTIONS', () => {
  it('tem uma pergunta por id, sem duplicatas', () => {
    const ids = PORTFOLIO_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('answerPortfolioQuestion', () => {
  const tooSmall: DiversificationInput = { positions: [position('PETR4', 10)], fixedIncomeCurrentCents: 0 };

  it('responde com o aviso de patrimônio pequeno para qualquer pergunta abaixo do piso', () => {
    for (const q of PORTFOLIO_QUESTIONS) {
      expect(answerPortfolioQuestion(q.id, tooSmall)).toMatch(/patrimônio.*pequeno/i);
    }
  });

  describe('diversificada', () => {
    it('junta as mensagens das tips ativas', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 10000)],
        fixedIncomeCurrentCents: 0,
      };
      const answer = answerPortfolioQuestion('diversificada', input);
      expect(answer).toMatch(/renda fixa/i);
    });

    it('responde a mensagem positiva quando nada dispara', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 2500), position('VALE3', 2500), position('HGLG11', 2000)],
        fixedIncomeCurrentCents: 300_000,
      };
      expect(answerPortfolioQuestion('diversificada', input)).toMatch(/boa distribuição|distribuída/i);
    });
  });

  describe('concentracao', () => {
    it('diz que não há renda variável quando a carteira só tem RF', () => {
      const input: DiversificationInput = { positions: [], fixedIncomeCurrentCents: 1_000_00 };
      expect(answerPortfolioQuestion('concentracao', input)).toMatch(/não tem posições/i);
    });

    it('alerta concentração acima de 40%', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 8000), position('VALE3', 1000), position('ITSA4', 1000)],
        fixedIncomeCurrentCents: 100_000,
      };
      const answer = answerPortfolioQuestion('concentracao', input);
      expect(answer).toMatch(/^Sim/);
      expect(answer).toContain('PETR4');
    });

    it('tranquiliza quando bem distribuída', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 3400), position('VALE3', 3300), position('ITSA4', 3300)],
        fixedIncomeCurrentCents: 100_000,
      };
      expect(answerPortfolioQuestion('concentracao', input)).toMatch(/^Não/);
    });
  });

  describe('renda-fixa', () => {
    it('devolve os dois percentuais e alerta quando RF é baixa', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 10000)],
        fixedIncomeCurrentCents: 0,
      };
      const answer = answerPortfolioQuestion('renda-fixa', input);
      expect(answer).toContain('0%');
      expect(answer).toContain('100%');
      expect(answer).toMatch(/pouco/i);
    });

    it('sem alerta quando RF já é suficiente', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 1000)],
        fixedIncomeCurrentCents: 900_000,
      };
      expect(answerPortfolioQuestion('renda-fixa', input)).not.toMatch(/pouco/i);
    });
  });

  describe('fiis', () => {
    it('confirma quando há FII', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 5000), position('HGLG11', 5000)],
        fixedIncomeCurrentCents: 100_000,
      };
      expect(answerPortfolioQuestion('fiis', input)).toMatch(/^Sim/);
    });

    it('nega mas sugere quando só há ações', () => {
      const input: DiversificationInput = {
        positions: [position('PETR4', 10000)],
        fixedIncomeCurrentCents: 100_000,
      };
      expect(answerPortfolioQuestion('fiis', input)).toMatch(/^Não\./);
    });

    it('diz que não há renda variável quando só há RF', () => {
      const input: DiversificationInput = { positions: [], fixedIncomeCurrentCents: 1_000_00 };
      expect(answerPortfolioQuestion('fiis', input)).toMatch(/não tem posições/i);
    });
  });
});
