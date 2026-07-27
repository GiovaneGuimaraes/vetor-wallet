/**
 * Utilitários compartilhados de eixo de gráfico (T-066).
 *
 * `MIN_ABS_PADDING` estava duplicado em `chartGeometry.ts` (gráfico de
 * projeção, T-057a) e `historyChart.ts` (gráfico de evolução, T-058b) — os
 * dois calculam margem do eixo Y com a mesma regra ("intervalo degenerado
 * cai para uma margem mínima absoluta"), então uma única fonte de verdade
 * evita as duas cópias divergirem se a margem mudar no futuro.
 *
 * `formatAxisValue` resolve a colisão de rótulos do eixo Y em carteiras na
 * casa dos bilhões: `Intl.NumberFormat('pt-BR', { style: 'currency', ... })`
 * produz strings como "R$ 1.234.567.890,12", que não cabem ao lado dos
 * marcadores de início/meio/fim (`ProjectionChart`/`HistoryChart`, ambos com
 * `viewBox` de ~320px). Valores >= mil são abreviados para "mil"/"mi"/"bi"
 * com 1 casa decimal; valores menores continuam no formato de moeda cheio
 * (não há o que abreviar e o formato cheio já é curto).
 */

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata a magnitude (já dividida pela escala) com 1 casa decimal em pt-BR. */
function formatMagnitude(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

/**
 * Formata um valor monetário para rótulo de eixo, abreviando magnitudes
 * grandes: "R$ 1,2 mi" (>= 1 milhão), "R$ 3,4 bi" (>= 1 bilhão), "R$ 12,3 mil"
 * (>= 1 mil). Abaixo de 1 mil, usa `Intl.NumberFormat` cheio (ex.: "R$
 * 823,10") — não há ganho de espaço em abreviar valores pequenos.
 *
 * Negativos preservam o sinal antes do "R$" (mesma convenção do
 * `Intl.NumberFormat` de moeda: `-R$ 1,2 mi`, não `R$ -1,2 mi`).
 */
export function formatAxisValue(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) return `${sign}R$ ${formatMagnitude(abs / 1_000_000_000)} bi`;
  if (abs >= 1_000_000) return `${sign}R$ ${formatMagnitude(abs / 1_000_000)} mi`;
  if (abs >= 1_000) return `${sign}R$ ${formatMagnitude(abs / 1_000)} mil`;
  return fmtCur.format(value);
}

/** Margem mínima absoluta quando o intervalo é degenerado e a baseline é 0. */
export const MIN_ABS_PADDING = 1;
