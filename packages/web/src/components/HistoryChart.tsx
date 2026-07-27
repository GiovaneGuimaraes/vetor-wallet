import { useState, type PointerEvent } from 'react';
import type { PortfolioHistoryPoint } from '@vetor-wallet/shared';
import { buildAreaPath, buildLinePath, pickTicks, scaleLinear } from '../routes/chartGeometry';
import { buildHistoryIndexScale, computeHistoryDomain, isHistoryDown } from '../routes/historyChart';
import { formatDayMonth } from '../routes/expenseMonth';
import { formatAxisValue } from '../routes/chartAxisFormat';
import { findNearestIndex, positionTooltip } from '../routes/chartHover';
import { svgPointFromPointerEvent } from '../routes/svgPointer';

/**
 * Gráfico SVG puro do card "Evolução da carteira" em `/dash` (T-058b) —
 * irmão do `ProjectionChart` (T-057b), mesma decisão de projeto: SVG escrito
 * à mão, sem lib de gráficos, componente **só de render** — toda a
 * matemática (domínio, escalas, paths, tendência) vem de `chartGeometry.ts`
 * e `historyChart.ts`.
 *
 * Duas linhas: `value` (valor de mercado, cor por tendência — mesma
 * semântica de P&L do resto do app) e `invested` (custo de aquisição das
 * posições detidas, linha de referência tracejada em `--color-dim`, sem
 * preenchimento). O eixo X mapeia ÍNDICE do ponto, não a data — a resposta
 * pode ter dias ausentes (fim de semana, sem preço), então os rótulos usam a
 * data REAL de cada ponto (`formatDayMonth`) em vez de assumir uma série
 * contígua de dias.
 *
 * Hover/tooltip (T-067): `onPointerMove` converte a posição do ponteiro para
 * coordenadas de `viewBox` (`svgPointFromPointerEvent`, DOM puro via
 * `getScreenCTM()`) e `findNearestIndex` (`chartHover.ts`) escolhe o ponto
 * mais próximo — mesma função pura usada por `PriceChart`/`ProjectionChart`.
 * `onPointerLeave` limpa o destaque.
 */

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 150;
const PADDING = { top: 20, right: 8, bottom: 24, left: 8 };
const TICK_COUNT = 3;

export interface HistoryChartProps {
  /** Pontos já em ordem crescente de data (`GET /api/portfolio/history`). */
  points: PortfolioHistoryPoint[];
}

export function HistoryChart({ points }: HistoryChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length < 2) return null;

  const chartLeft = PADDING.left;
  const chartRight = VIEW_WIDTH - PADDING.right;
  const chartTop = PADDING.top;
  const chartBottom = VIEW_HEIGHT - PADDING.bottom;

  const domain = computeHistoryDomain(points);
  const xScale = buildHistoryIndexScale(points.length, chartLeft, chartRight);
  const yScale = scaleLinear(domain.min, domain.max, chartBottom, chartTop);

  const valuePoints = points.map((p, i) => ({ x: xScale(i), y: yScale(p.value) }));
  const investedPoints = points.map((p, i) => ({ x: xScale(i), y: yScale(p.invested) }));

  const baselineY = chartBottom;
  const valueLinePath = buildLinePath(valuePoints);
  const valueAreaPath = buildAreaPath(valuePoints, baselineY);
  const investedLinePath = buildLinePath(investedPoints);

  const isDown = isHistoryDown(points);
  const lineColor = isDown ? 'var(--color-down)' : 'var(--color-up)';
  const areaFill = `color-mix(in srgb, ${lineColor} 12%, transparent)`;

  const ticks = pickTicks(
    points.map((p, i) => ({ ...p, index: i })),
    TICK_COUNT,
  ).map((tick) => ({
    ...tick,
    x: xScale(tick.index),
    y: yScale(tick.value),
  }));

  const gridValues = [domain.max, (domain.min + domain.max) / 2, domain.min];

  const first = points[0];
  const last = points[points.length - 1];
  const description = `Evolução da carteira de ${formatDayMonth(first.date)} (${fmtCur.format(
    first.value,
  )}) a ${formatDayMonth(last.date)} (${fmtCur.format(last.value)}). Custo de aquisição: ${fmtCur.format(
    last.invested,
  )}.`;

  const pointXs = valuePoints.map((p) => p.x);
  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const tooltipWidth = 96;
  const tooltip =
    hoverPoint !== null
      ? positionTooltip(valuePoints[hoverIndex as number].x, valuePoints[hoverIndex as number].y, VIEW_WIDTH, tooltipWidth)
      : null;

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const svgPoint = svgPointFromPointerEvent(event.currentTarget, event);
    if (svgPoint === null) return;
    setHoverIndex(findNearestIndex(pointXs, svgPoint.x));
  }

  function handlePointerLeave() {
    setHoverIndex(null);
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      style={{ width: '100%', height: 'auto' }}
      role="img"
      className="vw-history-chart"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <title>Gráfico de evolução da carteira</title>
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

      {/* Linha de referência do custo (invested) — tracejada, sem preenchimento,
          para não competir visualmente com a linha principal de valor. */}
      <path
        d={investedLinePath}
        fill="none"
        stroke="var(--color-dim)"
        strokeWidth={1.5}
        strokeDasharray="3 3"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      <path d={valueAreaPath} fill={areaFill} stroke="none" />
      <path
        d={valueLinePath}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {ticks.map((tick, i) => {
        const isFirst = i === 0;
        const isLast = i === ticks.length - 1;
        const anchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
        const nearTop = tick.y < chartTop + 14;
        const valueLabelY = nearTop ? tick.y + 14 : tick.y - 8;
        return (
          <g key={`tick-${tick.date}`}>
            <circle cx={tick.x} cy={tick.y} r={2.5} fill={lineColor} />
            <text x={tick.x} y={valueLabelY} textAnchor={anchor} fontSize={9} fill="var(--color-dim)">
              {formatAxisValue(tick.value)}
            </text>
            <text
              x={tick.x}
              y={VIEW_HEIGHT - 6}
              textAnchor={anchor}
              fontSize={9}
              fill="var(--color-dim)"
            >
              {formatDayMonth(tick.date)}
            </text>
          </g>
        );
      })}

      {hoverPoint !== null && tooltip !== null && (
        <g pointerEvents="none">
          <line
            x1={valuePoints[hoverIndex as number].x}
            y1={chartTop}
            x2={valuePoints[hoverIndex as number].x}
            y2={chartBottom}
            stroke="var(--color-dim)"
            strokeWidth={1}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={valuePoints[hoverIndex as number].x} cy={valuePoints[hoverIndex as number].y} r={3.5} fill={lineColor} />
          <foreignObject x={tooltip.anchor === 'end' ? tooltip.x - tooltipWidth : tooltip.x} y={Math.max(tooltip.y - 34, 0)} width={tooltipWidth} height={34}>
            <div className="vw-chart-tooltip">
              <div className="vw-chart-tooltip-date">{formatDayMonth(hoverPoint.date)}</div>
              <div className="vw-chart-tooltip-value">{fmtCur.format(hoverPoint.value)}</div>
            </div>
          </foreignObject>
        </g>
      )}
    </svg>
  );
}
