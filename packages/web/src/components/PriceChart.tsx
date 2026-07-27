import type { QuoteSnapshot } from '@vetor-wallet/shared';
import { buildAreaPath, buildLinePath, pickTicks, scaleLinear } from '../routes/chartGeometry';
import { buildHistoryIndexScale } from '../routes/historyChart';
import { computePriceDomain, isPriceSeriesDown, snapshotDate } from '../routes/priceChart';
import { formatDayMonth } from '../routes/expenseMonth';

/**
 * Gráfico SVG puro do card "Preço por ação" em `/dash` (T-060) — irmão de
 * `HistoryChart`/`ProjectionChart` (T-057b/T-058b): SVG escrito à mão, sem
 * lib de gráficos, componente só de render. Toda a matemática (domínio,
 * escala por índice, tendência) vem de `chartGeometry.ts`/`historyChart.ts`/
 * `priceChart.ts` — nenhuma lógica de dados nova vive aqui.
 *
 * Linha do preço de fechamento (eixo X por ÍNDICE do ponto — a série tem
 * buracos de fim de semana/feriado, mesmo motivo do `HistoryChart`) + linha
 * de referência HORIZONTAL tracejada do preço médio de compra, quando
 * houver. Sem tooltip/hover (mesmo precedente dos outros gráficos da dash).
 */

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 150;
const PADDING = { top: 20, right: 8, bottom: 24, left: 8 };
const TICK_COUNT = 3;

export interface PriceChartProps {
  /** Snapshots já em ordem crescente de `captured_at` (`GET /api/snapshots/:ticker`). */
  snapshots: QuoteSnapshot[];
  /** Preço médio de compra do usuário no ticker — `null` omite a referência. */
  averagePrice: number | null;
}

export function PriceChart({ snapshots, averagePrice }: PriceChartProps) {
  if (snapshots.length < 2) return null;

  const chartLeft = PADDING.left;
  const chartRight = VIEW_WIDTH - PADDING.right;
  const chartTop = PADDING.top;
  const chartBottom = VIEW_HEIGHT - PADDING.bottom;

  const prices = snapshots.map((s) => s.price);
  const domain = computePriceDomain(prices, averagePrice);
  const xScale = buildHistoryIndexScale(snapshots.length, chartLeft, chartRight);
  const yScale = scaleLinear(domain.min, domain.max, chartBottom, chartTop);

  const pricePoints = snapshots.map((s, i) => ({ x: xScale(i), y: yScale(s.price) }));
  const baselineY = chartBottom;
  const priceLinePath = buildLinePath(pricePoints);
  const priceAreaPath = buildAreaPath(pricePoints, baselineY);

  const isDown = isPriceSeriesDown(snapshots);
  const lineColor = isDown ? 'var(--color-down)' : 'var(--color-up)';
  const areaFill = `color-mix(in srgb, ${lineColor} 12%, transparent)`;

  const ticks = pickTicks(
    snapshots.map((s, i) => ({ ...s, index: i })),
    TICK_COUNT,
  ).map((tick) => ({
    ...tick,
    x: xScale(tick.index),
    y: yScale(tick.price),
  }));

  const gridValues = [domain.max, (domain.min + domain.max) / 2, domain.min];

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const description = `Preço de ${formatDayMonth(snapshotDate(first.captured_at))} (${fmtCur.format(
    first.price,
  )}) a ${formatDayMonth(snapshotDate(last.captured_at))} (${fmtCur.format(last.price)}).${
    averagePrice !== null ? ` Preço médio de compra: ${fmtCur.format(averagePrice)}.` : ''
  }`;

  const avgY = averagePrice !== null ? yScale(averagePrice) : null;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      style={{ width: '100%', height: 'auto' }}
      role="img"
      className="vw-price-chart"
    >
      <title>Gráfico de preço da ação</title>
      <desc>{description}</desc>

      {gridValues.map((value, i) => {
        const y = yScale(value);
        return (
          <line
            key={`grid-${i}`}
            x1={chartLeft}
            y1={y}
            x2={chartRight}
            y2={y}
            stroke="var(--color-edge)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {/* Linha de referência do preço médio de compra — horizontal,
          tracejada, sem preenchimento (mesmo estilo da linha de `invested`
          do HistoryChart). Ausente quando não há preço médio a mostrar. */}
      {avgY !== null && (
        <line
          x1={chartLeft}
          y1={avgY}
          x2={chartRight}
          y2={avgY}
          stroke="var(--color-dim)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}

      <path d={priceAreaPath} fill={areaFill} stroke="none" />
      <path
        d={priceLinePath}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {avgY !== null && averagePrice !== null && (
        <text x={chartRight} y={avgY - 4} textAnchor="end" fontSize={9} fill="var(--color-dim)">
          {`Médio: ${fmtCur.format(averagePrice)}`}
        </text>
      )}

      {ticks.map((tick, i) => {
        const isFirst = i === 0;
        const isLast = i === ticks.length - 1;
        const anchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
        const nearTop = tick.y < chartTop + 14;
        const valueLabelY = nearTop ? tick.y + 14 : tick.y - 8;
        return (
          <g key={`tick-${tick.id}`}>
            <circle cx={tick.x} cy={tick.y} r={2.5} fill={lineColor} />
            <text x={tick.x} y={valueLabelY} textAnchor={anchor} fontSize={9} fill="var(--color-dim)">
              {fmtCur.format(tick.price)}
            </text>
            <text
              x={tick.x}
              y={VIEW_HEIGHT - 6}
              textAnchor={anchor}
              fontSize={9}
              fill="var(--color-dim)"
            >
              {formatDayMonth(snapshotDate(tick.captured_at))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
