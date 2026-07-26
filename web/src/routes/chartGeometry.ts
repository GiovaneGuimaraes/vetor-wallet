/**
 * Matemática pura do gráfico de projeção de ações em `/dash` (T-057a).
 *
 * Tudo aqui é puro e sem DOM — nenhum SVG é renderizado neste arquivo (isso é
 * o componente da T-057b, que consome estas funções). Decisão do spike
 * (Plan/Opus): SVG puro, sem lib de gráficos — o bundle atual é só
 * React+router e o custo de uma lib inteira não se justifica para uma linha
 * de projeção composta.
 *
 * `buildProjectionSeries` usa a MESMA fórmula de juros compostos mensais do
 * simulador de poupança (T-040, `savingsProjection.ts`: `VF = VP × (1 + i)^m`)
 * e é pensada para ter assinatura compatível com `projectPortfolio` (T-056a,
 * em implementação paralela) — mesmas validações de entrada inválida.
 */

/** Ponto da série de projeção: mês (0..N) e valor projetado naquele mês. */
export interface ProjectionPoint {
  month: number;
  value: number;
}

/** Ponto de coordenadas de tela (SVG), já na escala de pixels do desenho. */
export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * Teto de pontos da série antes de reamostrar. 360px de largura (viewport
 * típico do card) não comporta um vértice por mês em prazos longos (ex.: 10
 * anos = 120 meses) sem virar ruído visual — e SVG puro não tem downsampling
 * embutido como uma lib de gráficos teria.
 */
export const MAX_SERIES_POINTS = 24;

/** Arredondamento em centavos, mesmo padrão dos valores monetários do app. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Escolhe os índices de mês (0..months) a materializar na série, no máximo
 * `maxPoints`. Mês 0 e mês `months` (extremos) são **sempre** incluídos —
 * perdê-los faria o gráfico não começar/terminar no valor correto. Passos
 * uniformes: os índices intermediários são espaçados por
 * `months / (maxPoints - 1)`, arredondados — como o arredondamento pode gerar
 * colisões perto das bordas, um `Set` deduplica antes de ordenar.
 */
function resampleMonthIndices(months: number, maxPoints: number): number[] {
  const total = months + 1;
  if (total <= maxPoints) {
    return Array.from({ length: total }, (_, i) => i);
  }
  const indices = new Set<number>();
  for (let i = 0; i < maxPoints - 1; i++) {
    indices.add(Math.round((i * months) / (maxPoints - 1)));
  }
  indices.add(months);
  return [...indices].sort((a, b) => a - b);
}

/**
 * Constrói a série mês 0..N da projeção composta do valor de mercado da
 * carteira, por juros compostos mensais (`VP × (1 + i)^m`).
 *
 * @param currentValue valor atual da carteira (R$), deve ser finito e ≥ 0
 * @param monthlyRatePct taxa mensal em pontos percentuais; **negativa é
 *   aceita** (cenário de queda), mas só até > -100 (uma taxa ≤ -100 %/mês
 *   zeraria ou inverteria o sinal do valor a cada passo, o que não descreve
 *   uma projeção de mercado sensata)
 * @param months prazo em meses, inteiro ≥ 0 (0 = série de 1 ponto, sem
 *   nenhuma composição)
 *
 * Entrada inválida (não finita, `currentValue` negativo, taxa ≤ -100,
 * `months` não inteiro ou negativo, ou estouro de `number` na composição)
 * devolve série **vazia** `[]` — nunca `NaN` num ponto do gráfico.
 *
 * Séries longas são reamostradas para no máximo {@link MAX_SERIES_POINTS}
 * pontos (ver {@link resampleMonthIndices}), sempre preservando mês 0 e mês N.
 */
export function buildProjectionSeries(
  currentValue: number,
  monthlyRatePct: number,
  months: number,
): ProjectionPoint[] {
  if (!Number.isFinite(currentValue) || currentValue < 0) return [];
  if (!Number.isFinite(monthlyRatePct) || monthlyRatePct <= -100) return [];
  if (!Number.isInteger(months) || months < 0) return [];

  const rate = monthlyRatePct / 100;
  const monthIndices = resampleMonthIndices(months, MAX_SERIES_POINTS);

  const series: ProjectionPoint[] = [];
  for (const month of monthIndices) {
    const raw = currentValue * Math.pow(1 + rate, month);
    if (!Number.isFinite(raw)) return [];
    series.push({ month, value: roundCents(raw) });
  }
  return series;
}

/**
 * Constrói um mapeamento linear de um domínio de dados para um range de
 * pixels (a mesma "escala" que uma lib de gráficos daria, escrita à mão).
 *
 * Guarda de **domínio degenerado** (`domainMin === domainMax`): sem ela, a
 * divisão por `domainMax - domainMin` geraria `NaN`/`Infinity`. Caso real que
 * dispara isso: uma projeção com taxa 0 tem série inteira no mesmo valor
 * (linha reta) — o domínio de valores colapsa num único ponto. Nesse caso a
 * escala devolve sempre o **centro do range**, o que desenha a reta no meio
 * do eixo (comportamento razoável — não há variação para posicionar).
 *
 * Funciona também com range invertido (`rangeMin > rangeMax`), necessário
 * para o eixo Y de SVG (cresce para baixo: valor maior → y menor).
 */
export function scaleLinear(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): (v: number) => number {
  if (domainMin === domainMax) {
    const center = (rangeMin + rangeMax) / 2;
    return () => center;
  }
  const ratio = (rangeMax - rangeMin) / (domainMax - domainMin);
  return (v: number) => rangeMin + (v - domainMin) * ratio;
}

/** Precisão limitada (2 casas) para os números do path — paths estáveis em teste. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Monta o atributo `d` de um `<path>` de linha SVG a partir de pontos já em
 * coordenadas de pixel: `M x y L x y L x y ...`. Vazio para série vazia (o
 * componente decide o que renderizar nesse caso — fora de escopo aqui).
 */
export function buildLinePath(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${round2(p.x)} ${round2(p.y)}`)
    .join(' ');
}

/**
 * Monta o atributo `d` de um `<path>` de área SVG: a linha de
 * {@link buildLinePath} fechada até uma baseline (ex.: o eixo X / y = 0
 * projetado), formando um polígono preenchível. Fecha na ordem
 * último-ponto → baseline, primeiro-ponto → baseline, `Z` — sem isso a área
 * "voltaria" cruzando a própria linha em vez de fechar por baixo.
 */
export function buildAreaPath(points: ChartPoint[], baselineY: number): string {
  if (points.length === 0) return '';
  const line = buildLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${round2(last.x)} ${round2(baselineY)} L ${round2(first.x)} ${round2(baselineY)} Z`;
}

/**
 * Escolhe até `count` elementos de `series` para servirem de rótulo de eixo,
 * sempre incluindo o **início e o fim** (legibilidade em 360px: mostrar só
 * início/meio/fim evita rótulos amontoados). Espaçamento uniforme pelos
 * índices da série (não pelo valor de `month`), então funciona igual para
 * série reamostrada ou não.
 *
 * `count <= 1` ou série de 1 ponto devolve só o primeiro elemento. Índices
 * intermediários podem colidir por arredondamento perto das bordas — um `Set`
 * deduplica antes de montar o resultado ordenado.
 */
export function pickTicks<T>(series: T[], count: number): T[] {
  if (series.length === 0) return [];
  if (count <= 1 || series.length === 1) return [series[0]];

  const n = Math.min(count, series.length);
  const indices = new Set<number>();
  for (let i = 0; i < n; i++) {
    indices.add(Math.round((i * (series.length - 1)) / (n - 1)));
  }
  return [...indices].sort((a, b) => a - b).map((i) => series[i]);
}
