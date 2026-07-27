import { useState, type PointerEvent } from 'react';
import type { PortfolioHistoryPoint } from '@vetor-wallet/shared';
import { buildAreaPath, buildLinePath, pickTicks, scaleLinear, type ChartPoint } from '../routes/chartGeometry';
import { buildHistoryIndexScale, computeHistoryDomain, isHistoryDown } from '../routes/historyChart';
import { collectLineValues, splitSegments, type AlignedSeries } from '../routes/benchmarkSeries';
import { formatDayMonth } from '../routes/expenseMonth';
import { formatAxisValue } from '../routes/chartAxisFormat';
import { findNearestIndex, positionTooltip } from '../routes/chartHover';
import { svgPointFromPointerEvent } from '../routes/svgPointer';

/**
 * Gráfico SVG puro do card "Evolução da carteira" em `/dash` (T-058b) —
 * irmão do `ProjectionChart` (T-057b), mesma decisão de projeto: SVG escrito
 * à mão, sem lib de gráficos, componente **só de render** — toda a
 * matemática (domínio, escalas, paths, tendência, normalização dos
 * benchmarks) vem de `chartGeometry.ts`, `historyChart.ts` e
 * `benchmarkSeries.ts`.
 *
 * Duas linhas base: `value` (valor de mercado, cor por tendência — mesma
 * semântica de P&L do resto do app) e `invested` (custo de aquisição das
 * posições detidas, linha de referência tracejada em `--color-dim`, sem
 * preenchimento). O eixo X mapeia ÍNDICE do ponto, não a data — a resposta
 * pode ter dias ausentes (fim de semana, sem preço), então os rótulos usam a
 * data REAL de cada ponto (`formatDayMonth`) em vez de assumir uma série
 * contígua de dias.
 *
 * Comparação com CDI/Ibovespa (T-068): linhas OPCIONAIS (`cdiLine`/`ibovLine`),
 * já normalizadas em reais pelo chamador (`buildBenchmarkLine`) — este
 * componente só desenha. Cada linha pode ter buracos (`null`), que
 * `splitSegments` transforma em vários `path` para não atravessar o vazio com
 * uma reta inventada; os valores presentes entram no domínio do eixo Y, para
 * que uma série que rendeu mais que a carteira não saia do desenho. A
 * legenda só lista as linhas efetivamente desenhadas.
 */

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 150;
const PADDING = { top: 20, right: 8, bottom: 24, left: 8 };
const TICK_COUNT = 3;

const CDI_COLOR = 'var(--color-bench-cdi)';
const IBOV_COLOR = 'var(--color-bench-ibov)';

export interface HistoryChartProps {
  /** Pontos já em ordem crescente de data (`GET /api/portfolio/history`). */
  points: PortfolioHistoryPoint[];
  /** Linha do CDI em reais, alinhada 1:1 com `points` (T-068). Ausente/`null` = não desenhar. */
  cdiLine?: AlignedSeries | null;
  /** Linha do Ibovespa em reais, alinhada 1:1 com `points` (T-068). */
  ibovLine?: AlignedSeries | null;
}

export function HistoryChart({ points, cdiLine, ibovLine }: HistoryChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length < 2) return null;

  const chartLeft = PADDING.left;
  const chartRight = VIEW_WIDTH - PADDING.right;
  const chartTop = PADDING.top;
  const chartBottom = VIEW_HEIGHT - PADDING.bottom;

  // Uma linha de benchmark só conta se tiver o mesmo comprimento de `points`
  // (o alinhamento é 1:1 por construção; a checagem evita desenhar lixo se um
  // fetch antigo escapar da guarda de resposta obsoleta do chamador).
  const cdi = cdiLine && cdiLine.length === points.length ? cdiLine : null;
  const ibov = ibovLine && ibovLine.length === points.length ? ibovLine : null;

  const domain = computeHistoryDomain(points, collectLineValues([cdi, ibov]));
  const xScale = buildHistoryIndexScale(points.length, chartLeft, chartRight);
  const yScale = scaleLinear(domain.min, domain.max, chartBottom, chartTop);

  const valuePoints = points.map((p, i) => ({ x: xScale(i), y: yScale(p.value) }));
  const investedPoints = points.map((p, i) => ({ x: xScale(i), y: yScale(p.invested) }));

  /** Segmentos contíguos de uma linha de benchmark, já em coordenadas do SVG. */
  function benchmarkSegments(line: AlignedSeries | null): ChartPoint[][] {
    if (line === null) return [];
    const projected: (ChartPoint | null)[] = line.map((v, i) =>
      v === null ? null : { x: xScale(i), y: yScale(v) },
    );
    return splitSegments(projected).filter((segment) => segment.length >= 2);
  }

  const cdiSegments = benchmarkSegments(cdi);
  const ibovSegments = benchmarkSegments(ibov);

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
  const benchmarkDescription = [
    cdi !== null ? `CDI: ${fmtCur.format(cdi[cdi.length - 1] ?? 0)}` : null,
    ibov !== null ? `Ibovespa: ${fmtCur.format(ibov[ibov.length - 1] ?? 0)}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join('. ');
  const description = `Evolução da carteira de ${formatDayMonth(first.date)} (${fmtCur.format(
    first.value,
  )}) a ${formatDayMonth(last.date)} (${fmtCur.format(last.value)}). Custo de aquisição: ${fmtCur.format(
    last.invested,
  )}.${
    benchmarkDescription
      ? ` Mesmo valor inicial aplicado nos benchmarks ao fim do período — ${benchmarkDescription}.`
      : ''
  }`;

  const pointXs = valuePoints.map((p) => p.x);
  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null;

  // O tooltip cresce com as linhas visíveis (T-068): além de data e valor da
  // carteira, mostra o valor do benchmark no MESMO dia, quando existe.
  const hoverRows =
    hoverIndex === null
      ? []
      : [
          cdi !== null && cdi[hoverIndex] !== null
            ? { label: 'CDI', value: cdi[hoverIndex] as number, color: CDI_COLOR }
            : null,
          ibov !== null && ibov[hoverIndex] !== null
            ? { label: 'Ibov', value: ibov[hoverIndex] as number, color: IBOV_COLOR }
            : null,
        ].filter((row): row is { label: string; value: number; color: string } => row !== null);

  const tooltipWidth = hoverRows.length > 0 ? 128 : 96;
  const tooltipHeight = 34 + hoverRows.length * 12;
  const tooltip =
    hoverPoint !== null
      ? positionTooltip(
          valuePoints[hoverIndex as number].x,
          valuePoints[hoverIndex as number].y,
          VIEW_WIDTH,
          tooltipWidth,
        )
      : null;

  const legend = [
    { label: 'Carteira', color: lineColor, dashed: false, shown: true },
    { label: 'Custo', color: 'var(--color-dim)', dashed: true, shown: true },
    { label: 'CDI', color: CDI_COLOR, dashed: false, shown: cdiSegments.length > 0 },
    { label: 'Ibovespa', color: IBOV_COLOR, dashed: false, shown: ibovSegments.length > 0 },
  ].filter((item) => item.shown);

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const svgPoint = svgPointFromPointerEvent(event.currentTarget, event);
    if (svgPoint === null) return;
    setHoverIndex(findNearestIndex(pointXs, svgPoint.x));
  }

  function handlePointerLeave() {
    setHoverIndex(null);
  }

  return (
    <>
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

        {/* Benchmarks (T-068): linhas finas e sem área, desenhadas ANTES da
            linha da carteira para que ela continue sendo a mais legível. */}
        {cdiSegments.map((segment, i) => (
          <path
            key={`cdi-${i}`}
            d={buildLinePath(segment)}
            fill="none"
            stroke={CDI_COLOR}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {ibovSegments.map((segment, i) => (
          <path
            key={`ibov-${i}`}
            d={buildLinePath(segment)}
            fill="none"
            stroke={IBOV_COLOR}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

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
            <foreignObject
              x={tooltip.anchor === 'end' ? tooltip.x - tooltipWidth : tooltip.x}
              y={Math.max(tooltip.y - tooltipHeight, 0)}
              width={tooltipWidth}
              height={tooltipHeight}
            >
              <div className="vw-chart-tooltip">
                <div className="vw-chart-tooltip-date">{formatDayMonth(hoverPoint.date)}</div>
                <div className="vw-chart-tooltip-value">{fmtCur.format(hoverPoint.value)}</div>
                {hoverRows.map((row) => (
                  <div key={row.label} className="vw-chart-tooltip-row" style={{ color: row.color }}>
                    {row.label} {fmtCur.format(row.value)}
                  </div>
                ))}
              </div>
            </foreignObject>
          </g>
        )}
      </svg>

      <ul className="vw-chart-legend">
        {legend.map((item) => (
          <li key={item.label}>
            <span
              className={`vw-chart-legend-swatch${item.dashed ? ' vw-chart-legend-swatch--dashed' : ''}`}
              style={{ color: item.color }}
              aria-hidden="true"
            />
            {item.label}
          </li>
        ))}
      </ul>
    </>
  );
}
