/**
 * Lógica pura de hover/tooltip para os gráficos SVG da dash (T-067) —
 * compartilhada por `HistoryChart`, `PriceChart` e `ProjectionChart`. Nenhum
 * dos três tinha interação além dos marcadores fixos de início/meio/fim
 * (decisão do spike da T-057a, revertida agora por pedido do humano).
 *
 * O componente já calcula a posição em pixel (viewBox) de cada ponto da
 * série (`xScale(i)`/`xScale(month)`) para desenhar a linha — os mesmos
 * arrays são reaproveitados aqui, então nenhuma escala nova é inventada.
 * `findNearestIndex` só precisa saber a coordenada X de cada ponto e a
 * coordenada X do ponteiro (ambas já em unidades de `viewBox`, não de tela —
 * a conversão tela→viewBox via `getScreenCTM()` é responsabilidade do
 * componente, é DOM puro e não tem o que testar aqui).
 */

/**
 * Índice do ponto mais próximo de `pointerX` dentre `pointXs` (coordenadas X
 * em pixels de `viewBox`, na mesma ordem da série — já devem estar
 * ordenadas crescentemente, como todo eixo X dos gráficos da dash).
 *
 * Bordas:
 * - série vazia → `null` (nada para destacar).
 * - série de 1 ponto → `0` sempre, qualquer `pointerX`.
 * - `pointerX` antes do primeiro ponto → `0` (clampa no primeiro, não
 *   extrapola).
 * - `pointerX` depois do último ponto → último índice (clampa no último).
 * - empate exato de distância entre dois pontos → o de índice menor vence
 *   (primeira ocorrência da menor distância).
 */
export function findNearestIndex(pointXs: number[], pointerX: number): number | null {
  if (pointXs.length === 0) return null;
  if (pointXs.length === 1) return 0;

  let bestIndex = 0;
  let bestDistance = Math.abs(pointXs[0] - pointerX);
  for (let i = 1; i < pointXs.length; i++) {
    const distance = Math.abs(pointXs[i] - pointerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/** Tooltip posicionado em pixels de `viewBox`, pronto para o componente estilizar. */
export interface TooltipPosition {
  x: number;
  y: number;
  /** `'start'` quando ancorado à esquerda do ponto, `'end'` quando a tooltip foi
   *  empurrada para a esquerda por estar perto da borda direita do desenho. */
  anchor: 'start' | 'end';
}

/**
 * Posiciona a tooltip perto do ponto (`pointX`/`pointY`), evitando que ela
 * estoure a borda direita de `viewWidth`: se o ponto está a menos de
 * `tooltipWidth` da borda direita, a âncora vira `'end'` (a tooltip cresce
 * para a esquerda a partir do ponto em vez de para a direita).
 *
 * `pointY` é deslocado para cima (`offsetY`) para a tooltip não cobrir o
 * próprio ponto/linha — mesmo padrão dos rótulos de valor já usados nos
 * marcadores fixos (`nearTop` em `HistoryChart`/`PriceChart`/`ProjectionChart`).
 */
export function positionTooltip(
  pointX: number,
  pointY: number,
  viewWidth: number,
  tooltipWidth: number,
  offsetY = 12
): TooltipPosition {
  const wouldOverflowRight = pointX + tooltipWidth > viewWidth;
  return {
    x: pointX,
    y: pointY - offsetY,
    anchor: wouldOverflowRight ? 'end' : 'start',
  };
}
