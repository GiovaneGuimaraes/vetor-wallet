import type { FixedIncomePosition, FixedIncomeSummary } from '@vetor-wallet/shared';
import type { StockTotals } from './homeMetrics';
import { sortByMaturity } from './fixedIncome';

/**
 * Funções puras do dashboard consolidado em `/investimentos` (T-091c/d,
 * fatia c3). Módulo sem React, sem I/O — mesma convenção de `fixedIncome.ts`
 * e `homeMetrics.ts`.
 *
 * Fecha a dívida deixada pela fatia (a)/(c2): o hub usava
 * `stockTotals.current` (B3) para qualquer nó que não fosse "em breve" —
 * achado do revisor da c2, contornado ali com um placeholder `—` para Renda
 * Fixa. `nodeValue` é a função única e explícita por `key`, para nenhum nó
 * novo herdar por acidente o total errado.
 */

export interface InvestmentsNodeData {
  stockTotals: StockTotals;
  /** `null` enquanto o resumo de Renda Fixa não carregou ou a busca falhou —
   * isolado do resto da página (ver `InvestimentosPage.tsx`). */
  fixedIncomeSummary: FixedIncomeSummary | null;
  /** RF lida ao vivo da conexão bancária, em centavos (T-091d, fatia d2).
   * 0 sem conexão, carregando ou em falha — ver `pluggyCentsForTotal`. */
  pluggyFixedIncomeCents?: number;
}

/**
 * Valor exibido no card de um nó da árvore, por `key`. `null` = mostrar o
 * traço (carregando, erro, ou "em breve" — a própria página decide o texto).
 *
 * `acoes` é SEMPRE `stockTotals.current` — o mesmo valor que `HomePage` e
 * `/investimentos/acoes` leem do `ShellContext`, nunca um recálculo.
 */
export function nodeValue(key: string, data: InvestmentsNodeData): number | null {
  switch (key) {
    case 'acoes':
      return data.stockTotals.current;
    case 'renda-fixa':
      // Manual + conexão bancária, somados em centavos. Sem o resumo manual o
      // card fica no traço mesmo com a Pluggy respondendo: um número só da
      // conexão sob o rótulo "Renda Fixa" pareceria o total e não é.
      return data.fixedIncomeSummary !== null
        ? (Math.round(data.fixedIncomeSummary.totalCurrent * 100) +
            (data.pluggyFixedIncomeCents ?? 0)) /
            100
        : null;
    default:
      // 'cripto' e qualquer nó futuro sem cálculo ligado: sem dado, não um
      // total emprestado de outro nó.
      return null;
  }
}

/** Total consolidado (Ações + Renda Fixa), somado em centavos inteiros. */
export interface InvestmentsOverview {
  totalCurrentCents: number;
  stockCurrentCents: number;
  fixedIncomeCurrentCents: number;
  /** false enquanto o resumo de Renda Fixa não carregou/falhou — nesse caso
   * `fixedIncomeCurrentCents` entra como 0 na soma (nunca o total da B3
   * sozinho disfarçado de "consolidado"). */
  fixedIncomeAvailable: boolean;
  /** Parte de `fixedIncomeCurrentCents` que veio da conexão bancária (fatia
   * d2) — para a tela dizer quanto do total é de cada fonte. */
  fixedIncomePluggyCents: number;
}

/**
 * `pluggyFixedIncomeCents` (T-091d, fatia d2): RF lida ao vivo da conexão,
 * SOMADA à manual — as duas fontes não se casam ainda (d3). Só entra quando o
 * resumo manual está disponível, pela mesma razão do `nodeValue`.
 */
export function buildInvestmentsOverview(
  stockTotals: StockTotals,
  fixedIncomeSummary: FixedIncomeSummary | null,
  pluggyFixedIncomeCents = 0
): InvestmentsOverview {
  const stockCurrentCents = Math.round(stockTotals.current * 100);
  const fixedIncomeAvailable = fixedIncomeSummary !== null;
  const fixedIncomePluggyCents = fixedIncomeAvailable ? pluggyFixedIncomeCents : 0;
  const fixedIncomeCurrentCents = fixedIncomeAvailable
    ? Math.round((fixedIncomeSummary as FixedIncomeSummary).totalCurrent * 100) +
      fixedIncomePluggyCents
    : 0;

  return {
    totalCurrentCents: stockCurrentCents + fixedIncomeCurrentCents,
    stockCurrentCents,
    fixedIncomeCurrentCents,
    fixedIncomeAvailable,
    fixedIncomePluggyCents,
  };
}

export interface AllocationSlice {
  key: 'acoes' | 'renda-fixa';
  label: string;
  cents: number;
  /** 0..100. 0 quando o total consolidado é 0 (nunca NaN/Infinity). */
  percent: number;
}

/** Alocação por classe para a barra do hub. Ordem fixa: Ações, Renda Fixa. */
export function buildAllocation(overview: InvestmentsOverview): AllocationSlice[] {
  const total = overview.totalCurrentCents;
  const percentOf = (cents: number): number => (total > 0 ? (cents / total) * 100 : 0);

  return [
    {
      key: 'acoes',
      label: 'Ações',
      cents: overview.stockCurrentCents,
      percent: percentOf(overview.stockCurrentCents),
    },
    {
      key: 'renda-fixa',
      label: 'Renda Fixa',
      cents: overview.fixedIncomeCurrentCents,
      percent: percentOf(overview.fixedIncomeCurrentCents),
    },
  ];
}

/**
 * Top `limit` posições de Renda Fixa por vencimento mais próximo, para a
 * lista "Próximos vencimentos" do hub. Reusa `sortByMaturity` (não duplica a
 * ordenação) e filtra fora a liquidez diária (`maturity_date: null`) — não há
 * "vencimento" para destacar nesses casos.
 */
export function upcomingMaturities(
  positions: FixedIncomePosition[],
  limit = 3
): FixedIncomePosition[] {
  return sortByMaturity(positions)
    .filter((position) => position.maturity_date !== null)
    .slice(0, limit);
}
