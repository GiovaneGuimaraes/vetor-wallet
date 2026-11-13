import type { Position } from '@vetor-wallet/shared';

/**
 * Sugestões de diversificação do "agente VetorWallet" em `/investimentos`.
 *
 * Deliberadamente SEM IA/LLM: regras fixas, em cima do que já temos na tela
 * (posições da B3 + total consolidado de Renda Fixa). Ponto de partida para
 * depois, se fizer sentido, virar um agente de fato (ver TODO-HUMANO.md,
 * "Agente de insights de ações/cripto" — mesma régua informativo-nunca-
 * consultivo: aqui já nasce informativo, nunca recomenda comprar/vender um
 * ativo específico).
 *
 * Fontes das regras (práticas mais citadas por corretoras/educadores
 * financeiros, não há um número oficial único): reserva de segurança em
 * ativos líquidos de baixo risco ANTES de concentrar em renda variável;
 * evitar concentração alta num único ativo; diversificar também DENTRO da
 * renda variável (ações × fundos imobiliários).
 */

export type TickerClass = 'ACAO' | 'FII' | 'OUTRO';

/**
 * Classificação pelo sufixo do código B3 — heurística, não um dado vindo da
 * brapi (não existe campo de tipo em `Position`/`Operation`, ver `shared`).
 * Termina em "11" → tratado como FII (a maioria dos tickers "11" que uma
 * pessoa física compra são fundos imobiliários; Units como SANB11 também
 * terminam em "11" e cairiam aqui por engano — risco aceito no MVP).
 * Termina em dígito 3-8 → ação (ON/PN/PNA/PNB/Units de ação, BDR incluso —
 * todos são renda variável "ação" para fins desta conta).
 */
export function classifyTicker(ticker: string): TickerClass {
  if (/11$/.test(ticker)) return 'FII';
  if (/[3-8]$/.test(ticker)) return 'ACAO';
  return 'OUTRO';
}

export interface DiversificationInput {
  /** Posições da carteira de Ações (B3) — `walletSummary.positions`. */
  positions: Position[];
  /** Renda Fixa já consolidada (manual + conexão bancária), em centavos — `overview.fixedIncomeCurrentCents`. */
  fixedIncomeCurrentCents: number;
}

export type DiversificationTipLevel = 'warn' | 'info' | 'ok';

export interface DiversificationTip {
  id: 'sem-renda-fixa' | 'concentracao' | 'sem-fii' | 'diversificada';
  level: DiversificationTipLevel;
  title: string;
  message: string;
}

/** Abaixo disto o patrimônio em investimentos é residual demais para gerar sugestão (ruído). */
export const MIN_TOTAL_CENTS_FOR_TIPS = 100_00;
/** % mínima em Renda Fixa antes de avisar sobre reserva de segurança baixa. */
export const MIN_RENDA_FIXA_PCT = 10;
/** % acima da qual um único ativo de renda variável é considerado concentração alta. */
export const MAX_CONCENTRATION_PCT = 40;

/**
 * Cotação indisponível (falha silenciosa da brapi, ver CLAUDE.md › "Falha
 * silenciosa de cotações") degrada para o valor investido — MESMA convenção
 * de `homeMetrics.computeStockTotals` — nunca para zero. Zero faria o
 * assistente dizer "você não tem posições" com a carteira cheia só porque a
 * brapi está fora do ar.
 */
function positionCents(position: Position): number {
  return Math.round((position.currentValue ?? position.invested) * 100);
}

export interface PortfolioStats {
  variableCents: number;
  fixedIncomeCents: number;
  totalCents: number;
  /** 0..100. 0 quando `totalCents` é 0. */
  rendaFixaPct: number;
  biggestTicker: string | null;
  biggestCents: number;
  /** % do maior ativo dentro da renda variável. 0 quando `variableCents` é 0. */
  concentrationPct: number;
  fiiCents: number;
  acaoCents: number;
  /** % de FII dentro da renda variável. 0 quando `variableCents` é 0. */
  fiiPct: number;
}

/**
 * Números crus por trás das tips e do painel de perguntas prontas
 * (`portfolioAssistant.ts`) — uma única fonte de verdade para os dois.
 */
export function computePortfolioStats(input: DiversificationInput): PortfolioStats {
  const variableCents = input.positions.reduce((sum, p) => sum + positionCents(p), 0);
  const fixedIncomeCents = input.fixedIncomeCurrentCents;
  const totalCents = variableCents + fixedIncomeCents;

  let biggestTicker: string | null = null;
  let biggestCents = 0;
  for (const p of input.positions) {
    const cents = positionCents(p);
    if (cents > biggestCents) {
      biggestCents = cents;
      biggestTicker = p.ticker;
    }
  }

  const fiiCents = input.positions
    .filter((p) => classifyTicker(p.ticker) === 'FII')
    .reduce((sum, p) => sum + positionCents(p), 0);
  const acaoCents = input.positions
    .filter((p) => classifyTicker(p.ticker) === 'ACAO')
    .reduce((sum, p) => sum + positionCents(p), 0);

  return {
    variableCents,
    fixedIncomeCents,
    totalCents,
    rendaFixaPct: totalCents > 0 ? (fixedIncomeCents / totalCents) * 100 : 0,
    biggestTicker,
    biggestCents,
    concentrationPct: variableCents > 0 ? (biggestCents / variableCents) * 100 : 0,
    fiiCents,
    acaoCents,
    fiiPct: variableCents > 0 ? (fiiCents / variableCents) * 100 : 0,
  };
}

export function buildDiversificationTips(input: DiversificationInput): DiversificationTip[] {
  const stats = computePortfolioStats(input);
  if (stats.totalCents < MIN_TOTAL_CENTS_FOR_TIPS) return [];

  const tips: DiversificationTip[] = [];

  if (stats.variableCents > 0) {
    if (stats.rendaFixaPct < MIN_RENDA_FIXA_PCT) {
      tips.push({
        id: 'sem-renda-fixa',
        level: 'warn',
        title: 'Pouca reserva em renda fixa',
        message:
          `Só ${stats.rendaFixaPct.toFixed(0)}% do seu patrimônio em investimentos está em ` +
          'renda fixa. A prática mais comum é manter uma reserva em ativos líquidos e de baixo ' +
          'risco (Tesouro Selic, CDB com liquidez diária) antes de concentrar tudo em renda ' +
          'variável.',
      });
    }

    if (stats.concentrationPct > MAX_CONCENTRATION_PCT) {
      tips.push({
        id: 'concentracao',
        level: 'warn',
        title: 'Carteira concentrada em um único ativo',
        message:
          `Um ativo responde por ${stats.concentrationPct.toFixed(0)}% da sua renda variável. ` +
          'Diversificar entre mais empresas/fundos reduz o impacto de um resultado ruim isolado.',
      });
    }

    if (stats.acaoCents > 0 && stats.fiiCents === 0) {
      tips.push({
        id: 'sem-fii',
        level: 'info',
        title: 'Sem fundos imobiliários na carteira',
        message:
          'Você tem posição em ações, mas nenhuma em fundos imobiliários (FIIs). Misturar as ' +
          'duas classes é uma forma comum de diversificar dentro da renda variável.',
      });
    }
  }

  if (tips.length === 0) {
    tips.push({
      id: 'diversificada',
      level: 'ok',
      title: 'Carteira com boa distribuição',
      message:
        'Sua carteira está distribuída entre renda variável e renda fixa, sem concentração ' +
        'alta em um único ativo — nenhum alerta por aqui hoje.',
    });
  }

  return tips;
}
