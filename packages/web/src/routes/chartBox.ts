/**
 * Tamanho do viewBox dos gráficos SVG de card, em pixels reais do container.
 *
 * Com viewBox fixo (320) e `width: 100%`, o SVG escalava ~3,5x em desktop e os
 * rótulos (fontSize no espaço do viewBox) saíam gigantes, além de a altura
 * crescer junto. Aqui o viewBox acompanha a largura medida: escala ~1:1, texto
 * legível e altura limitada.
 */
export interface ChartBox {
  width: number;
  height: number;
}

export const DEFAULT_CHART_WIDTH = 320;

export function computeChartBox(
  containerWidth: number,
  { ratio, minHeight, maxHeight }: { ratio: number; minHeight: number; maxHeight: number }
): ChartBox {
  const width =
    Number.isFinite(containerWidth) && containerWidth > 0
      ? Math.round(containerWidth)
      : DEFAULT_CHART_WIDTH;
  const height = Math.round(Math.min(maxHeight, Math.max(minHeight, width * ratio)));
  return { width, height };
}
