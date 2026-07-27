import type { BenchmarkSeriesPoint, PortfolioHistoryPoint } from '@vetor-wallet/shared';

/**
 * Normalização das séries de CDI/Ibovespa para o gráfico "Evolução da
 * carteira" (T-068) — consome `GET /api/benchmarks/history`.
 *
 * A pergunta que as linhas de benchmark respondem é **"e se o MESMO dinheiro
 * tivesse ido pro CDI/Ibovespa?"**. Por isso a normalização é base-100 no
 * ponto de partida do período EXIBIDO, com a base expressa em reais: cada
 * série é reancorada no primeiro dia comparável da janela e escalada para
 * valer, naquele dia, exatamente o valor da carteira. As três linhas saem do
 * mesmo ponto e a distância vertical entre elas passa a ser dinheiro de
 * verdade — o que permite desenhá-las no mesmo eixo Y em BRL, sem um segundo
 * eixo em índice (que seria ilegível e faria a área da carteira perder
 * sentido).
 *
 * Decisões sobre buracos de data:
 *
 * - **Buraco no meio → forward-fill** (repete o último valor conhecido do
 *   benchmark). CDI e Ibovespa só têm dado em dia útil, enquanto a série da
 *   carteira pode ter pontos em fim de semana/feriado. Interpolar linearmente
 *   inventaria movimento intradiário que não existiu; repetir o último
 *   fechamento é a mesma escolha (e o mesmo motivo) do forward-fill de preços
 *   do `/api/portfolio/history` (T-058a).
 * - **Buraco no INÍCIO → fica `null`**, sem back-fill. Se a fonte externa só
 *   começa no meio da janela, não há de onde puxar valor para trás — inventar
 *   um daria a impressão falsa de um benchmark parado. A linha simplesmente
 *   começa depois, e a âncora da base passa a ser esse primeiro dia
 *   comparável (as linhas continuam se encontrando ali).
 * - **Buraco no FIM**: coberto pelo forward-fill (o último fechamento
 *   conhecido se estende até o fim da janela).
 */

/** Série alinhada às datas do histórico: um valor por data, `null` onde não há dado. */
export type AlignedSeries = (number | null)[];

/**
 * Alinha uma série de benchmark às `dates` do histórico da carteira, com
 * forward-fill dos buracos internos e `null` nas datas anteriores ao primeiro
 * ponto conhecido do benchmark.
 *
 * Pontos com valor não finito são ignorados (não viram nem valor nem base do
 * forward-fill). A série de entrada é ordenada por data defensivamente — a
 * rota já devolve ordenada, mas esta função não deve depender disso.
 */
export function alignBenchmarkSeries(
  series: BenchmarkSeriesPoint[],
  dates: string[],
): AlignedSeries {
  const sorted = [...series]
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => a.date.localeCompare(b.date));

  const aligned: AlignedSeries = [];
  let cursor = 0;
  let lastKnown: number | null = null;

  for (const date of dates) {
    while (cursor < sorted.length && sorted[cursor].date <= date) {
      lastKnown = sorted[cursor].value;
      cursor += 1;
    }
    aligned.push(lastKnown);
  }

  return aligned;
}

/**
 * Reescala a série alinhada para reais, ancorando-a no primeiro índice em que
 * BENCHMARK e carteira têm valor: nesse índice a linha vale exatamente
 * `portfolioValues[i]`, e nos demais vale `portfolioValues[i] × (v / v_âncora)`.
 *
 * Devolve `null` quando não há comparação possível: séries de tamanhos
 * diferentes, nenhum índice com os dois valores presentes, ou valor da âncora
 * igual a 0 / não finito (**divisão por zero no ponto de partida** — um índice
 * de benchmark zerado não tem razão de rentabilidade definida).
 */
export function rebaseToPortfolio(
  aligned: AlignedSeries,
  portfolioValues: number[],
): AlignedSeries | null {
  if (aligned.length !== portfolioValues.length || aligned.length === 0) return null;

  let anchorIndex = -1;
  for (let i = 0; i < aligned.length; i += 1) {
    if (aligned[i] !== null && Number.isFinite(portfolioValues[i])) {
      anchorIndex = i;
      break;
    }
  }
  if (anchorIndex === -1) return null;

  const anchorBenchmark = aligned[anchorIndex] as number;
  if (!Number.isFinite(anchorBenchmark) || anchorBenchmark === 0) return null;

  const base = portfolioValues[anchorIndex];
  const factor = base / anchorBenchmark;

  return aligned.map((value) => (value === null ? null : value * factor));
}

/**
 * Composição de `alignBenchmarkSeries` + `rebaseToPortfolio`: da série crua da
 * API para a linha em reais pronta para desenhar sobre os `points` do
 * histórico. `null` quando a comparação não é possível (série vazia/ausente,
 * histórico vazio, âncora zerada) — a UI então não desenha aquela linha.
 */
export function buildBenchmarkLine(
  series: BenchmarkSeriesPoint[] | null | undefined,
  points: PortfolioHistoryPoint[],
): AlignedSeries | null {
  if (!series || series.length === 0 || points.length === 0) return null;
  const aligned = alignBenchmarkSeries(
    series,
    points.map((p) => p.date),
  );
  return rebaseToPortfolio(
    aligned,
    points.map((p) => p.value),
  );
}

/**
 * Todos os valores presentes das linhas visíveis, para alimentar o domínio do
 * eixo Y — sem isso uma linha de benchmark que sobe mais que a carteira sairia
 * do desenho.
 */
export function collectLineValues(lines: (AlignedSeries | null | undefined)[]): number[] {
  const values: number[] = [];
  for (const line of lines) {
    if (!line) continue;
    for (const value of line) {
      if (value !== null && Number.isFinite(value)) values.push(value);
    }
  }
  return values;
}

/**
 * Quebra uma sequência com buracos em segmentos contíguos de valores
 * presentes — cada segmento vira um `path` próprio no SVG, para que o buraco
 * do início (ou qualquer outro) NÃO seja atravessado por uma reta inventada.
 * Segmentos de 1 ponto são mantidos (o componente decide desenhar ponto ou
 * ignorar).
 */
export function splitSegments<T>(items: (T | null)[]): T[][] {
  const segments: T[][] = [];
  let current: T[] = [];

  for (const item of items) {
    if (item === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      continue;
    }
    current.push(item);
  }
  if (current.length > 0) segments.push(current);

  return segments;
}
