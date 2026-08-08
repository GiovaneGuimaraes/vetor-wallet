/**
 * Conversão de coordenadas de tela (clientX/clientY de um `PointerEvent`)
 * para coordenadas de `viewBox` de um `<svg>` (T-067). Wrapper fino sobre
 * `SVGSVGElement.getScreenCTM()` — API do DOM, sem lógica de negócio para
 * testar em unit test (jsdom não implementa `getScreenCTM`/`createSVGPoint`
 * com geometria real). A lógica testável (qual ponto da série está mais
 * próximo, onde posicionar a tooltip) vive em `chartHover.ts`, puro e sem
 * DOM; este arquivo só existe para os componentes não duplicarem a mesma
 * chamada de API em três lugares.
 */
export function svgPointFromPointerEvent(
  svg: SVGSVGElement,
  event: { clientX: number; clientY: number }
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}
