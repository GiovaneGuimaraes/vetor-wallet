import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FixedIncomePosition, FixedIncomeSummary } from '@vetor-wallet/shared';
import { getFixedIncome } from '../api';
import { BackToHomeLink } from '../components/BackToHomeLink';
import { useShellContext } from '../layout/ShellContext';
import { mascotSrcForLayer } from '../layout/mascots';
import { computeStockTotals } from './homeMetrics';
import { maturityLabel, rateLabel } from './fixedIncome';
import { INVESTMENT_NODES } from './investmentsTree';
import {
  buildAllocation,
  buildInvestmentsOverview,
  nodeValue,
  upcomingMaturities,
} from './investmentsDashboard';
import './layers-savings.css';
import './investimentos.css';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Rota `/investimentos` (T-091a, dashboard desde a T-091c/d fatia c3): hub do
 * guarda-chuva de Investimentos — Ações, Cripto e Renda Fixa como IRMÃS, com
 * um total consolidado, uma barra de alocação e os próximos vencimentos de
 * Renda Fixa, além da navegação por clique já existente desde a fase (a).
 *
 * O valor do card de Ações reusa `computeStockTotals` sobre o
 * `walletSummary` do `ShellContext` — exatamente a mesma expressão da
 * `HomePage` (o portfolio já foi buscado uma vez por `App.refreshWallet`).
 * Reimplementar a soma aqui seria a maneira mais fácil de a carteira B3
 * passar a mostrar dois números diferentes em duas telas.
 *
 * O resumo de Renda Fixa (`GET /api/fixed-income`) é buscado À PARTE, num
 * `useEffect` isolado desta página — nunca dentro do fluxo do `ShellContext`.
 * **Isolamento de falha**: se essa busca falhar, só o card de Renda Fixa (e o
 * que depende dele: total consolidado, barra, vencimentos) cai para `—`/estado
 * de erro; o card de Ações, que não depende desse fetch, continua mostrando o
 * número real. `nodeValue` (`investmentsDashboard.ts`) é quem decide, por
 * `key`, qual card usa qual fonte — fechando a dívida herdada da fase (a) em
 * que qualquer nó não-"em breve" mostrava o total da B3 (achado do revisor da
 * fatia c2).
 */
export function InvestimentosPage() {
  const navigate = useNavigate();
  const { walletSummary } = useShellContext();

  const [fixedIncomeSummary, setFixedIncomeSummary] = useState<FixedIncomeSummary | null>(null);
  const [fixedIncomePositions, setFixedIncomePositions] = useState<FixedIncomePosition[]>([]);
  const [fixedIncomeError, setFixedIncomeError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFixedIncome()
      .then((data) => {
        if (cancelled) return;
        setFixedIncomeSummary(data.summary);
        setFixedIncomePositions(data.positions);
        setFixedIncomeError(false);
      })
      .catch(() => {
        // Isolado de propósito: uma falha aqui NUNCA deve derrubar o resto da
        // página — Ações continua vindo do ShellContext, já resolvido.
        if (cancelled) return;
        setFixedIncomeSummary(null);
        setFixedIncomePositions([]);
        setFixedIncomeError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stockTotals = computeStockTotals(walletSummary ? [walletSummary] : []);
  const dash = '—';

  const overview = buildInvestmentsOverview(stockTotals, fixedIncomeSummary);
  const allocation = buildAllocation(overview);
  const upcoming = upcomingMaturities(fixedIncomePositions);

  return (
    <div>
      <BackToHomeLink />
      <div className="vw-page-header-row">
        <div className="vw-page-header">
          <h1 className="vw-page-title">Investimentos</h1>
          <p className="vw-page-subtitle">Ações, cripto e renda fixa</p>
        </div>
        <img
          src={mascotSrcForLayer('investimentos')}
          alt=""
          className="vw-page-mascot"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      </div>

      <div className="vw-invest-overview">
        <div className="vw-invest-overview-total">
          <p className="vw-savings-summary-label">Total consolidado</p>
          <p className="vw-savings-summary-value">
            {fmtCur.format(overview.totalCurrentCents / 100)}
          </p>
          {!overview.fixedIncomeAvailable && (
            <p className="vw-savings-summary-sub">
              {fixedIncomeError
                ? 'Não foi possível carregar a Renda Fixa agora — este total mostra só Ações.'
                : 'Carregando Renda Fixa…'}
            </p>
          )}
        </div>

        <div className="vw-invest-allocation" aria-label="Alocação por classe">
          <svg
            viewBox="0 0 100 12"
            preserveAspectRatio="none"
            className="vw-invest-allocation-bar"
            role="img"
          >
            <title>Alocação entre Ações e Renda Fixa</title>
            {allocation.map((slice, i) => {
              const before = allocation.slice(0, i).reduce((sum, s) => sum + s.percent, 0);
              if (slice.percent <= 0) return null;
              return (
                <rect
                  key={slice.key}
                  x={before}
                  y={0}
                  width={slice.percent}
                  height={12}
                  className={`vw-invest-allocation-slice vw-invest-allocation-${slice.key}`}
                />
              );
            })}
          </svg>
          <div className="vw-invest-allocation-legend">
            {allocation.map((slice) => (
              <span key={slice.key} className={`vw-invest-allocation-legend-item`}>
                <i className={`vw-invest-allocation-dot vw-invest-allocation-${slice.key}`} />
                {slice.label} · {slice.percent.toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="vw-layer-grid">
        {INVESTMENT_NODES.map((node, i) => {
          const value = nodeValue(node.key, { stockTotals, fixedIncomeSummary });
          return (
            <button
              key={node.key}
              type="button"
              className="vw-layer-card vw-rise"
              style={{ ['--vw-rise-i' as string]: i + 1 }}
              onClick={() => navigate(node.path)}
            >
              <p className="vw-layer-card-name">{node.name}</p>
              <p className="vw-layer-card-desc">{node.desc}</p>
              <p className="vw-layer-card-value">
                {node.comingSoon || value === null ? dash : fmtCur.format(value)}
              </p>
              {node.comingSoon && <span className="vw-layer-card-chip">em breve</span>}
              <img
                src={`/layers/${node.mascot}`}
                alt=""
                className="vw-layer-card-mascot"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="vw-invest-upcoming">
        <h2 className="vw-invest-upcoming-title">Próximos vencimentos</h2>
        {upcoming.length === 0 ? (
          <div className="vw-state-box">
            {fixedIncomeError
              ? 'Não foi possível carregar os vencimentos de Renda Fixa agora.'
              : 'Nenhum vencimento próximo cadastrado em Renda Fixa.'}
          </div>
        ) : (
          <ul className="vw-invest-upcoming-list">
            {upcoming.map((position) => (
              <li key={position.id} className="vw-invest-upcoming-item">
                <span className="vw-invest-upcoming-name">
                  {position.name}
                  {position.institution ? ` · ${position.institution}` : ''}
                </span>
                <span className="vw-invest-upcoming-meta">
                  {maturityLabel(position.maturity_date, todayIso())} ·{' '}
                  {rateLabel(position.rate_type, position.rate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
