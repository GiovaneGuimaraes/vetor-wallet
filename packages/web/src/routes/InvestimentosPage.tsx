import { useNavigate } from 'react-router-dom';
import { BackToHomeLink } from '../components/BackToHomeLink';
import { useShellContext } from '../layout/ShellContext';
import { mascotSrcForLayer } from '../layout/mascots';
import { computeStockTotals } from './homeMetrics';
import { INVESTMENT_NODES } from './investmentsTree';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Rota `/investimentos` (T-091a): hub do guarda-chuva de Investimentos —
 * Ações, Cripto e Renda Fixa como IRMÃS. Só navegação: nenhuma chamada de
 * API própria, nenhum cálculo novo.
 *
 * O valor do card de Ações reusa `computeStockTotals` sobre o
 * `walletSummary` do `ShellContext` — exatamente a mesma expressão da
 * `HomePage` (o portfolio já foi buscado uma vez por `App.refreshWallet`).
 * Reimplementar a soma aqui seria a maneira mais fácil de a carteira B3
 * passar a mostrar dois números diferentes em duas telas.
 */
export function InvestimentosPage() {
  const navigate = useNavigate();
  const { walletSummary } = useShellContext();

  const stockTotals = computeStockTotals(walletSummary ? [walletSummary] : []);
  const dash = '—';

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

      <div className="vw-layer-grid">
        {INVESTMENT_NODES.map((node, i) => (
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
              {node.comingSoon ? dash : fmtCur.format(stockTotals.current)}
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
        ))}
      </div>
    </div>
  );
}
