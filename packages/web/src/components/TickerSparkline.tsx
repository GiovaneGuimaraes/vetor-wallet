import { useTickerHistory, type TickerHistoryOptions } from './tickerHistory';
import { SPARKLINE_PERIOD, slicePeriod, sparklinePath, trendTone } from '../routes/stockCharts';

const W = 72;
const H = 26;

/**
 * Minigráfico (último mês de fechamentos diários) de um ticker, verde na alta
 * e vermelho na baixa do período. Carrega sozinho e entra quando o histórico
 * chega — a linha da lista nunca espera por ele. Sem histórico: um traço
 * discreto no lugar, sem quebrar a linha.
 */
export function TickerSparkline({ ticker, ...options }: { ticker: string } & TickerHistoryOptions) {
  const state = useTickerHistory(ticker, options);

  if (state.status === 'loading') {
    return <span className="vw-spark vw-spark--loading" aria-label="Carregando gráfico" />;
  }

  const points = state.status === 'ok' ? slicePeriod(state.data.points, SPARKLINE_PERIOD) : [];
  const d = sparklinePath(
    points.map((p) => p.close),
    W,
    H
  );
  if (d === null) {
    return (
      <span className="vw-spark vw-spark--empty" title="Sem histórico de preço">
        —
      </span>
    );
  }

  const tone = trendTone(points);
  return (
    <svg
      className={`vw-spark vw-spark--${tone}`}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`${ticker}: ${tone === 'up' ? 'alta' : tone === 'down' ? 'baixa' : 'estável'} no último mês`}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
