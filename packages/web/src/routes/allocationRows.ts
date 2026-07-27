import type { Position } from '@vetor-wallet/shared';

/**
 * Linha de exibição das barras de alocação por ticker (T-057c), extraída de
 * `PortfolioDashboard.tsx` no mesmo padrão de função pura testável de
 * `budgetProgress.ts`/`chartGeometry.ts`.
 */
export interface AllocationRow {
  ticker: string;
  /** Percentual bruto (0–100) ou `null` quando a cotação está indisponível. */
  pct: number | null;
  /** Percentual limitado a [0, 100] para a largura visual da barra; 0 quando `pct` é `null`. */
  pctClamped: number;
  /** Rótulo pronto para exibição, 1 casa decimal pt-BR (ex.: "42,3%"), ou "—" quando `pct` é `null`. */
  pctLabel: string;
}

const pctFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Monta as linhas de alocação a partir das posições do portfólio, ordenadas
 * por `allocationPct` decrescente — posições com `allocationPct` nulo
 * (cotação indisponível para aquele ticker, ver `services/portfolio.ts` no
 * server) vão para o final, mantendo a ordem relativa entre si estável.
 *
 * Nunca produz `NaN`: uma posição com `allocationPct: null` vira uma linha
 * com `pctClamped: 0` e `pctLabel: '—'` (barra vazia), em vez de propagar o
 * `null` para a matemática de largura da barra.
 */
export function buildAllocationRows(positions: Position[]): AllocationRow[] {
  return [...positions]
    .sort((a, b) => {
      if (a.allocationPct === null && b.allocationPct === null) return 0;
      if (a.allocationPct === null) return 1;
      if (b.allocationPct === null) return -1;
      return b.allocationPct - a.allocationPct;
    })
    .map((p) => ({
      ticker: p.ticker,
      pct: p.allocationPct,
      pctClamped: p.allocationPct === null ? 0 : Math.min(100, Math.max(0, p.allocationPct)),
      pctLabel: p.allocationPct === null ? '—' : `${pctFormatter.format(p.allocationPct)}%`,
    }));
}
