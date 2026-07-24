import type { PortfolioSummary } from '@vetor-wallet/shared';

/**
 * T-016: resolve o que o chip de P&L do `WalletCard` deve exibir.
 *
 * Prioriza o P&L do dia (`dayProfitLossPct`, derivado de `quote_snapshots`)
 * quando disponível. Cai no P&L total desde o início da carteira — rotulado
 * explicitamente como "total" — quando o dado diário não existe (ex.: algum
 * ticker ativo sem snapshot de fechamento anterior, ou cotações indisponíveis).
 *
 * Extraída para ser testável isoladamente do JSX/estilos do componente,
 * seguindo o padrão de `routes/homeMetrics.ts`.
 */
export interface WalletChip {
  pct: number;
  label: 'hoje' | 'total';
  isProfit: boolean;
}

export function resolveWalletChip(summary: PortfolioSummary | undefined): WalletChip {
  const hasDayData = summary?.dayProfitLossPct != null;
  const pct = hasDayData ? summary!.dayProfitLossPct! : summary?.totalProfitLossPct ?? 0;
  return { pct, label: hasDayData ? 'hoje' : 'total', isProfit: pct >= 0 };
}
