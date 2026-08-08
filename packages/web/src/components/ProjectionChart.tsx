import { useState, type PointerEvent } from 'react';
import {
  buildAreaPath,
  buildLinePath,
  computeValueDomain,
  pickTicks,
  scaleLinear,
  type ProjectionPoint,
} from '../routes/chartGeometry';
import { formatAxisValue } from '../routes/chartAxisFormat';
import { findNearestIndex, positionTooltip } from '../routes/chartHover';
import { svgPointFromPointerEvent } from '../routes/svgPointer';

/**
 * Gráfico SVG puro do card "Projeção de ganhos" em `/dash` (T-057b).
 *
 * Decisão do spike (Plan/Opus, T-057a): SVG escrito à mão, sem lib de
 * gráficos — o bundle atual é só React+router e o custo de uma lib inteira
 * não se justifica para uma linha de projeção composta. Este componente é
 * **só de render**: toda a matemática (série, escalas, paths, domínio,
 * seleção de rótulos) vem de `chartGeometry.ts` (T-057a) e de
 * `computeValueDomain` (adicionada aqui, T-057b) — nenhuma lógica de dados
 * nova vive neste arquivo.
 *
 * Hover/tooltip (T-067, revertendo a decisão "sem tooltip" do spike a
 * pedido do humano): além dos marcadores fixos de início/meio/fim, mover o
 * mouse sobre a linha destaca o mês mais próximo (`findNearestIndex`,
 * `chartHover.ts`) e mostra o valor projetado naquele mês. Tema light/dark
 * sai de graça: nenhuma cor é literal, tudo vem das CSS custom properties de
 * `index.css` (`--color-up`/`--color-down`/`--color-edge`/`--color-dim`),
 * então o componente não precisa saber em qual tema está.
 *
 * O chamador (`DashboardPage`) só renderiza este componente quando a
 * projeção é válida e a série tem >= 2 pontos — mas o guard abaixo (`return
 * null` para série < 2) é defensivo, para o componente nunca desenhar um
 * path degenerado se algum dia for reusado em outro lugar sem essa checagem.
 */

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 140;
/** Margens do desenho: espaço para os rótulos de valor/mês nas bordas. */
const PADDING = { top: 20, right: 8, bottom: 20, left: 8 };
/** Início/meio/fim — a mesma contagem de `pickTicks` já usada por outros specs. */
const TICK_COUNT = 3;

export interface ProjectionChartProps {
  /** Série mês 0..N já pronta (`buildProjectionSeries`, `chartGeometry.ts`). */
  series: ProjectionPoint[];
}

export function ProjectionChart({ series }: ProjectionChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (series.length < 2) return null;

  const baseline = series[0].value;
  const finalValue = series[series.length - 1].value;
  const months = series[series.length - 1].month;

  const chartLeft = PADDING.left;
  const chartRight = VIEW_WIDTH - PADDING.right;
  const chartTop = PADDING.top;
  const chartBottom = VIEW_HEIGHT - PADDING.bottom;

  const domain = computeValueDomain(
    series.map((p) => p.value),
    baseline
  );

  const xScale = scaleLinear(0, months, chartLeft, chartRight);
  const yScale = scaleLinear(domain.min, domain.max, chartBottom, chartTop);

  const points = series.map((p) => ({ x: xScale(p.month), y: yScale(p.value) }));
  const baselineY = yScale(baseline);
  const linePath = buildLinePath(points);
  const areaPath = buildAreaPath(points, baselineY);

  // Queda: a projeção termina abaixo de onde começou — troca a cor de
  // "ganho" (--color-up) para "perda" (--color-down), coerente com o resto
  // do app (P&L negativo, rendimento negativo etc.).
  const isDown = finalValue < baseline;
  const lineColor = isDown ? 'var(--color-down)' : 'var(--color-up)';
  const areaFill = `color-mix(in srgb, ${lineColor} 12%, transparent)`;

  const ticks = pickTicks(series, TICK_COUNT).map((tick) => ({
    ...tick,
    x: xScale(tick.month),
    y: yScale(tick.value),
  }));

  const gridValues = [domain.max, (domain.min + domain.max) / 2, domain.min];

  const description = isDown
    ? `Projeção de queda: de ${fmtCur.format(baseline)} para ${fmtCur.format(finalValue)} em ${months} ${
        months === 1 ? 'mês' : 'meses'
      }.`
    : `Projeção de crescimento: de ${fmtCur.format(baseline)} para ${fmtCur.format(finalValue)} em ${months} ${
        months === 1 ? 'mês' : 'meses'
      }.`;

  const pointXs = points.map((p) => p.x);
  const hoverPoint = hoverIndex !== null ? series[hoverIndex] : null;
  const tooltipWidth = 96;
  const tooltip =
    hoverPoint !== null
      ? positionTooltip(
          points[hoverIndex as number].x,
          points[hoverIndex as number].y,
          VIEW_WIDTH,
          tooltipWidth
        )
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
      className="vw-projection-chart"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <title>Gráfico da projeção de ganhos da carteira</title>
      <desc>{description}</desc>

      {/* Grade discreta: 3 linhas horizontais (topo/meio/base do domínio). */}
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

      {/* Linha-base horizontal no valor inicial (tracejada, para se distinguir
          da grade sólida acima). */}
      <line
        x1={chartLeft}
        y1={baselineY}
        x2={chartRight}
        y2={baselineY}
        stroke="var(--color-edge)"
        strokeWidth={1}
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />

      <path d={areaPath} fill={areaFill} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* Marcadores de início/meio/fim com o valor já escrito ao lado — sem
          tooltip/hover (decisão do spike). */}
      {ticks.map((tick, i) => {
        const isFirst = i === 0;
        const isLast = i === ticks.length - 1;
        const anchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
        const nearTop = tick.y < chartTop + 14;
        const labelY = nearTop ? tick.y + 14 : tick.y - 8;
        return (
          <g key={`tick-${tick.month}`}>
            <circle cx={tick.x} cy={tick.y} r={2.5} fill={lineColor} />
            <text x={tick.x} y={labelY} textAnchor={anchor} fontSize={9} fill="var(--color-dim)">
              {formatAxisValue(tick.value)}
            </text>
          </g>
        );
      })}

      {hoverPoint !== null && tooltip !== null && (
        <g pointerEvents="none">
          <line
            x1={points[hoverIndex as number].x}
            y1={chartTop}
            x2={points[hoverIndex as number].x}
            y2={chartBottom}
            stroke="var(--color-dim)"
            strokeWidth={1}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={points[hoverIndex as number].x}
            cy={points[hoverIndex as number].y}
            r={3.5}
            fill={lineColor}
          />
          <foreignObject
            x={tooltip.anchor === 'end' ? tooltip.x - tooltipWidth : tooltip.x}
            y={Math.max(tooltip.y - 34, 0)}
            width={tooltipWidth}
            height={34}
          >
            <div className="vw-chart-tooltip">
              <div className="vw-chart-tooltip-date">{`Mês ${hoverPoint.month}`}</div>
              <div className="vw-chart-tooltip-value">{fmtCur.format(hoverPoint.value)}</div>
            </div>
          </foreignObject>
        </g>
      )}
    </svg>
  );
}
