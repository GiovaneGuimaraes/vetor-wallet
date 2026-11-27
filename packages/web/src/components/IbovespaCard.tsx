import { useTickerHistory } from './tickerHistory';
import { TickerSparkline } from './TickerSparkline';
import { IBOV_TICKER, formatIndexPoints } from '../routes/stockCharts';
import { changeTone, formatAsOf, formatChange } from '../routes/marketToday';

/**
 * Linha do Ibovespa no topo do "Mercado hoje": pontos, variação do dia e
 * minigráfico. Tudo vem do MESMO histórico (`^BVSP`, 1 requisição à brapi que
 * o servidor cacheia por horas) — por isso o horário do dado aparece ao lado.
 * Clicar abre o gráfico expandido. Falha não esconde a lista do mercado.
 */
export function IbovespaCard({
  onSelect,
  enabled = true,
}: {
  onSelect: () => void;
  /** `false` = espera (a carteira carrega antes; ver MarketToday). */
  enabled?: boolean;
}) {
  const state = useTickerHistory(IBOV_TICKER, { enabled });
  const data = state.status === 'ok' ? state.data : null;
  const last = data?.points[data.points.length - 1]?.close ?? null;
  const value = data?.price ?? last;
  const change = data?.changePercent ?? null;
  const asOf = data ? formatAsOf(data.fetchedAt) : null;

  return (
    <button type="button" className="vw-ibov" onClick={onSelect} title="Abrir gráfico">
      <span className="vw-market-id">
        <span className="vw-market-ticker">Ibovespa</span>
        <span className="vw-market-name">
          {state.status === 'error'
            ? 'Índice indisponível agora'
            : asOf
              ? `Índice B3 · dado das ${asOf}`
              : 'Índice B3'}
        </span>
      </span>
      <TickerSparkline ticker={IBOV_TICKER} enabled={enabled} />
      <span className="vw-market-quote">
        <span className="vw-market-price">
          {value !== null ? formatIndexPoints(value) : state.status === 'loading' ? '…' : '—'}
        </span>
        {change !== null && (
          <span className={`vw-market-change vw-market-change--${changeTone(change)}`}>
            {formatChange(change)}
          </span>
        )}
      </span>
    </button>
  );
}
