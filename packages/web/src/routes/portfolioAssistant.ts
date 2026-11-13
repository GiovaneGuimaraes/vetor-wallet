import {
  buildDiversificationTips,
  computePortfolioStats,
  MIN_RENDA_FIXA_PCT,
  MIN_TOTAL_CENTS_FOR_TIPS,
  type DiversificationInput,
} from './diversificationInsights';

/**
 * Painel "Agente VetorWallet" em `/investimentos`: em vez de um chat livre
 * com IA, o usuário escolhe uma pergunta de uma lista fixa e a resposta é
 * texto gerado por regra — mesma ideia de `diversificationInsights.ts` (sem
 * IA/LLM), reaproveitando os MESMOS números (`computePortfolioStats`) para
 * as duas telas nunca divergirem.
 */

export type PortfolioQuestionId = 'diversificada' | 'concentracao' | 'renda-fixa' | 'fiis';

export interface PortfolioQuestion {
  id: PortfolioQuestionId;
  label: string;
}

export const PORTFOLIO_QUESTIONS: PortfolioQuestion[] = [
  { id: 'diversificada', label: 'Minha carteira está bem diversificada?' },
  { id: 'concentracao', label: 'Tenho concentração alta em algum ativo?' },
  { id: 'renda-fixa', label: 'Quanto tenho em renda fixa x renda variável?' },
  { id: 'fiis', label: 'Tenho fundos imobiliários (FIIs) na carteira?' },
];

function pct(n: number): string {
  return n.toFixed(0);
}

function tooSmallAnswer(): string {
  return (
    'Seu patrimônio em investimentos ainda é pequeno demais para essa análise fazer sentido ' +
    '— volte aqui quando tiver mais posições lançadas.'
  );
}

export function answerPortfolioQuestion(
  id: PortfolioQuestionId,
  input: DiversificationInput
): string {
  const stats = computePortfolioStats(input);
  if (stats.totalCents < MIN_TOTAL_CENTS_FOR_TIPS) return tooSmallAnswer();

  switch (id) {
    case 'diversificada':
      return buildDiversificationTips(input)
        .map((tip) => tip.message)
        .join(' ');

    case 'concentracao':
      if (stats.variableCents === 0) {
        return 'Você ainda não tem posições de renda variável (ações/FIIs) para essa análise.';
      }
      return stats.concentrationPct > 40
        ? `Sim: ${stats.biggestTicker} responde por ${pct(stats.concentrationPct)}% da sua ` +
            'renda variável. Diversificar entre mais ativos reduz o impacto de um resultado ' +
            'ruim isolado.'
        : `Não — seu ativo mais pesado é ${stats.biggestTicker}, com ${pct(stats.concentrationPct)}% ` +
            'da renda variável, dentro do que considero uma concentração saudável.';

    case 'renda-fixa': {
      const variavelPct = 100 - stats.rendaFixaPct;
      const base =
        `Hoje você tem ${pct(stats.rendaFixaPct)}% em renda fixa e ${pct(variavelPct)}% em ` +
        'renda variável (ações + FIIs).';
      return stats.variableCents > 0 && stats.rendaFixaPct < MIN_RENDA_FIXA_PCT
        ? `${base} Isso é pouco pela prática mais comum, que é ter uma reserva de segurança em ` +
            'renda fixa antes de concentrar tudo em renda variável.'
        : base;
    }

    case 'fiis':
      if (stats.fiiCents > 0) {
        return `Sim — ${pct(stats.fiiPct)}% da sua renda variável está em fundos imobiliários.`;
      }
      return stats.acaoCents > 0
        ? 'Não. Você tem ações, mas nenhum FII — misturar as duas classes é uma forma comum de ' +
            'diversificar dentro da renda variável.'
        : 'Você ainda não tem posições de renda variável (nem ações, nem FIIs).';

    default: {
      const exhaustive: never = id;
      throw new Error(`Pergunta desconhecida: ${exhaustive}`);
    }
  }
}
