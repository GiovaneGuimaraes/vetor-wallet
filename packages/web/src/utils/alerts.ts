import type { AlertRule, PortfolioSummary } from '@vetor-wallet/shared';

export interface TriggeredAlert {
  rule: AlertRule;
  currentValue: number;
  message: string;
}

const fmtBrl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function evaluateAlerts(
  rules: AlertRule[],
  portfolio: PortfolioSummary,
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;
    const pos = portfolio.positions.find((p) => p.ticker === rule.ticker);
    if (!pos) continue;

    switch (rule.type) {
      case 'PRICE_ABOVE':
        if (pos.currentPrice !== null && pos.currentPrice >= rule.threshold) {
          triggered.push({
            rule,
            currentValue: pos.currentPrice,
            message: `${rule.ticker} está em ${fmtBrl.format(pos.currentPrice)} — acima do alvo de ${fmtBrl.format(rule.threshold)}`,
          });
        }
        break;
      case 'PRICE_BELOW':
        if (pos.currentPrice !== null && pos.currentPrice <= rule.threshold) {
          triggered.push({
            rule,
            currentValue: pos.currentPrice,
            message: `${rule.ticker} está em ${fmtBrl.format(pos.currentPrice)} — abaixo do alvo de ${fmtBrl.format(rule.threshold)}`,
          });
        }
        break;
      case 'CHANGE_PCT':
        if (pos.profitLossPct !== null && pos.profitLossPct <= -rule.threshold) {
          triggered.push({
            rule,
            currentValue: pos.profitLossPct,
            message: `${rule.ticker} acumula queda de ${pos.profitLossPct.toFixed(2)}% — limite de -${rule.threshold}% atingido`,
          });
        }
        break;
      case 'ALLOCATION_PCT':
        if (pos.allocationPct !== null && pos.allocationPct >= rule.threshold) {
          triggered.push({
            rule,
            currentValue: pos.allocationPct,
            message: `${rule.ticker} representa ${pos.allocationPct.toFixed(1)}% da carteira — limite de ${rule.threshold}% atingido`,
          });
        }
        break;
    }
  }

  return triggered;
}
