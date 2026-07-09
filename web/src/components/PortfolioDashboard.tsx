import type { PortfolioSummary } from '@vetor-wallet/shared';

interface Props {
  summary: PortfolioSummary | null;
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const fmtCur = (v: number | null) => (v === null ? '—' : fmt.format(v));

function plColor(v: number | null) {
  if (v === null) return 'text-ink';
  return v >= 0 ? 'text-up' : 'text-down';
}

const th = 'pb-3 text-xs font-medium text-dim uppercase tracking-wide whitespace-nowrap';
const td = 'py-3 tabular-nums whitespace-nowrap';

export function PortfolioDashboard({ summary }: Props) {
  if (!summary || summary.positions.length === 0) {
    return (
      <div className="bg-card border border-edge rounded-xl p-5 md:p-6">
        <h2 className="text-sm font-semibold text-ink mb-4">Dashboard</h2>
        <p className="text-sm text-dim text-center py-8">
          Adicione operações para ver sua carteira.
        </p>
      </div>
    );
  }

  const { positions, totalInvested, totalCurrentValue, totalProfitLoss, totalProfitLossPct } =
    summary;

  const resultBorder =
    totalProfitLoss === null
      ? 'border-edge'
      : totalProfitLoss >= 0
        ? 'border-up/30'
        : 'border-down/30';

  return (
    <div className="flex flex-col gap-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-edge rounded-xl p-5">
          <p className="text-xs font-medium text-dim uppercase tracking-wide mb-2">Investido</p>
          <p className="text-2xl font-semibold tabular-nums text-ink">
            {fmt.format(totalInvested)}
          </p>
        </div>

        <div className="bg-card border border-edge rounded-xl p-5">
          <p className="text-xs font-medium text-dim uppercase tracking-wide mb-2">Valor Atual</p>
          <p className="text-2xl font-semibold tabular-nums text-ink">
            {fmtCur(totalCurrentValue)}
          </p>
        </div>

        <div className={`bg-card border rounded-xl p-5 ${resultBorder}`}>
          <p className="text-xs font-medium text-dim uppercase tracking-wide mb-2">Resultado</p>
          <p className={`text-2xl font-semibold tabular-nums ${plColor(totalProfitLoss)}`}>
            {fmtCur(totalProfitLoss)}
          </p>
          <p className={`text-sm mt-1 tabular-nums ${plColor(totalProfitLossPct)}`}>
            {fmtPct(totalProfitLossPct)}
          </p>
        </div>
      </div>

      {/* Positions table */}
      <div className="bg-card border border-edge rounded-xl p-5 md:p-6">
        <h2 className="text-sm font-semibold text-ink mb-4">Posições</h2>

        <div className="overflow-x-auto -mx-5 md:-mx-6">
          <table className="w-full text-sm" style={{ minWidth: '680px' }}>
            <thead>
              <tr className="border-b border-edge/60">
                <th className={`${th} text-left pl-5 md:pl-6 pr-4`}>Ticker</th>
                <th className={`${th} text-right pr-4`}>Qtd</th>
                <th className={`${th} text-right pr-4`}>PM (R$)</th>
                <th className={`${th} text-right pr-4`}>Cotação</th>
                <th className={`${th} text-right pr-4`}>Investido</th>
                <th className={`${th} text-right pr-4`}>Valor Atual</th>
                <th className={`${th} text-right pr-4`}>Resultado</th>
                <th className={`${th} text-right pr-4`}>%</th>
                <th className={`${th} text-right pr-5 md:pr-6`}>Carteira</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr
                  key={p.ticker}
                  className="border-b border-edge/30 last:border-0 hover:bg-raised/40 transition-colors"
                >
                  <td className={`${td} pl-5 md:pl-6 pr-4 font-semibold text-ink`}>{p.ticker}</td>
                  <td className={`${td} pr-4 text-right text-ink/70`}>
                    {p.quantity.toLocaleString('pt-BR')}
                  </td>
                  <td className={`${td} pr-4 text-right text-ink/70`}>{fmt.format(p.avgPrice)}</td>
                  <td className={`${td} pr-4 text-right text-ink/70`}>{fmtCur(p.currentPrice)}</td>
                  <td className={`${td} pr-4 text-right text-ink/70`}>{fmt.format(p.invested)}</td>
                  <td className={`${td} pr-4 text-right text-ink/70`}>{fmtCur(p.currentValue)}</td>
                  <td className={`${td} pr-4 text-right font-medium ${plColor(p.profitLoss)}`}>
                    {fmtCur(p.profitLoss)}
                  </td>
                  <td className={`${td} pr-4 text-right font-medium ${plColor(p.profitLossPct)}`}>
                    {fmtPct(p.profitLossPct)}
                  </td>
                  <td className={`${td} pr-5 md:pr-6 text-right text-dim`}>
                    {p.allocationPct !== null ? `${p.allocationPct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
