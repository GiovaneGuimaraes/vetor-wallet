import type { PortfolioSummary } from '../types';

interface Props {
  summary: PortfolioSummary | null;
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number | null) =>
  v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const fmtCur = (v: number | null) => (v === null ? '—' : fmt.format(v));
const colorClass = (v: number | null) => (v === null ? '' : v >= 0 ? 'positive' : 'negative');

export function PortfolioDashboard({ summary }: Props) {
  if (!summary || summary.positions.length === 0) {
    return (
      <div className="card">
        <h2>Dashboard</h2>
        <p className="empty">Adicione operações para ver sua carteira.</p>
      </div>
    );
  }

  const { positions, totalInvested, totalCurrentValue, totalProfitLoss, totalProfitLossPct } = summary;

  return (
    <div className="dashboard">
      <div className="summary-cards">
        <div className="summary-card">
          <span className="label">Investido</span>
          <span className="value">{fmt.format(totalInvested)}</span>
        </div>
        <div className="summary-card">
          <span className="label">Valor Atual</span>
          <span className="value">{fmtCur(totalCurrentValue)}</span>
        </div>
        <div className={`summary-card ${colorClass(totalProfitLoss)}`}>
          <span className="label">Resultado</span>
          <span className="value">{fmtCur(totalProfitLoss)}</span>
          <span className="sub">{fmtPct(totalProfitLossPct)}</span>
        </div>
      </div>

      <div className="card">
        <h2>Posições</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Qtd</th>
                <th>PM (R$)</th>
                <th>Cotação (R$)</th>
                <th>Investido</th>
                <th>Valor Atual</th>
                <th>Resultado</th>
                <th>%</th>
                <th>Carteira</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(p => (
                <tr key={p.ticker}>
                  <td><strong>{p.ticker}</strong></td>
                  <td>{p.quantity.toLocaleString('pt-BR')}</td>
                  <td>{fmt.format(p.avgPrice)}</td>
                  <td>{fmtCur(p.currentPrice)}</td>
                  <td>{fmt.format(p.invested)}</td>
                  <td>{fmtCur(p.currentValue)}</td>
                  <td className={colorClass(p.profitLoss)}>{fmtCur(p.profitLoss)}</td>
                  <td className={colorClass(p.profitLossPct)}>{fmtPct(p.profitLossPct)}</td>
                  <td>{p.allocationPct !== null ? `${p.allocationPct.toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
