import { useNavigate } from 'react-router-dom';
import { useShellContext } from '../layout/ShellContext';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

interface LayerCardConfig {
  key: string;
  path: string;
  mascot: string;
  name: string;
  desc: string;
  chip?: string;
}

const LAYER_CARDS: LayerCardConfig[] = [
  { key: 'renda', path: '/renda', mascot: 'receitas-t.png', name: 'Renda mensal', desc: 'Fontes de receita do mês' },
  { key: 'despesas', path: '/despesas', mascot: 'despesas-t.png', name: 'Despesas', desc: 'Gastos por categoria' },
  { key: 'poupanca', path: '/poupanca', mascot: 'poupanca-t.png', name: 'Poupança', desc: 'Saldo, aportes e rendimento' },
  { key: 'acoes', path: '/carteiras', mascot: 'acoes-t.png', name: 'Ações', desc: 'Suas carteiras da B3' },
  { key: 'cripto', path: '/cripto', mascot: 'cripto-t.png', name: 'Criptomoedas', desc: 'Em breve', chip: 'em breve' },
  { key: 'metas', path: '/metas', mascot: 'metas-t.png', name: 'Metas', desc: 'Progresso dos seus objetivos' },
];

/**
 * Rota `/home` (T-004): hero + grid de cards de layer. Conteúdo real (dados
 * de renda/despesas/poupança/metas) é escopo de T-008..T-013; aqui só a
 * estrutura de navegação e o valor agregado das carteiras de ações (dado já
 * disponível hoje via `/api/portfolio`).
 */
export function HomePage() {
  const navigate = useNavigate();
  const { walletSummaries } = useShellContext();

  const totalInvested = Object.values(walletSummaries).reduce((acc, s) => acc + s.totalInvested, 0);
  const totalCurrent = Object.values(walletSummaries).reduce(
    (acc, s) => acc + (s.totalCurrentValue ?? s.totalInvested),
    0,
  );

  return (
    <div>
      <div className="vw-hero-card vw-rise" style={{ ['--vw-rise-i' as string]: 0 }}>
        <p className="vw-hero-total-label">Patrimônio total</p>
        <p className="vw-hero-total-value">{fmtCur.format(totalCurrent)}</p>
        <div className="vw-hero-metrics">
          <div>
            <p className="vw-hero-metric-label">Investido</p>
            <p className="vw-hero-metric-value">{fmtCur.format(totalInvested)}</p>
          </div>
          <div>
            <p className="vw-hero-metric-label">Resultado</p>
            <p className="vw-hero-metric-value">{fmtCur.format(totalCurrent - totalInvested)}</p>
          </div>
        </div>
      </div>

      <div className="vw-layer-grid">
        {LAYER_CARDS.map((card, i) => (
          <button
            key={card.key}
            type="button"
            className="vw-layer-card vw-rise"
            style={{ ['--vw-rise-i' as string]: i + 1 }}
            onClick={() => navigate(card.path)}
          >
            <p className="vw-layer-card-name">{card.name}</p>
            <p className="vw-layer-card-desc">{card.desc}</p>
            {card.key === 'acoes' ? (
              <p className="vw-layer-card-value">{fmtCur.format(totalCurrent)}</p>
            ) : (
              <p className="vw-layer-card-value">—</p>
            )}
            {card.chip && <span className="vw-layer-card-chip">{card.chip}</span>}
            <img
              src={`/layers/${card.mascot}`}
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
