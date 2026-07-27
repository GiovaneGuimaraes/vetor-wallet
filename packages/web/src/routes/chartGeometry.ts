import { projectPortfolio } from './portfolioProjection';
import { MIN_ABS_PADDING } from './chartAxisFormat';

/**
 * Matemática pura do gráfico de projeção de ações em `/dash` (T-057a).
 *
 * Tudo aqui é puro e sem DOM — nenhum SVG é renderizado neste arquivo (isso é
 * o componente da T-057b, que consome estas funções). Decisão do spike
 * (Plan/Opus): SVG puro, sem lib de gráficos — o bundle atual é só
 * React+router e o custo de uma lib inteira não se justifica para uma linha
 * de projeção composta.
 *
 * `buildProjectionSeries` **delega o cálculo de cada ponto a
 * `projectPortfolio`** (`portfolioProjection.ts`, T-056a) desde a T-062, em vez
 * de repetir a fórmula: com o aporte mensal recorrente entrando na conta, ter
 * duas cópias da fórmula composta (uma para os números do card, outra para a
 * linha do gráfico) seria duas fontes de verdade que divergiriam na primeira
 * mudança. As validações de entrada e a guarda de overflow vêm de graça pelo
 * mesmo caminho.
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
 * carteira, com aporte mensal recorrente opcional (T-062).
 *
 * Cada ponto do mês `m` é exatamente `projectPortfolio(currentValue,
 * monthlyRatePct, m, monthlyContribution).futureValue` — a MESMA função que
 * produz os números do card, chamada com o prazo parcial. Consequência
 * desejada: o último ponto da série é sempre igual ao `futureValue` exibido
 * (coberto por teste), e nenhuma fórmula é duplicada aqui.
 *
 * @param currentValue valor atual da carteira (R$), deve ser finito e ≥ 0
 * @param monthlyRatePct taxa mensal em pontos percentuais; **negativa é
 *   aceita** (cenário de queda), mas só até > -100 (uma taxa ≤ -100 %/mês
 *   zeraria ou inverteria o sinal do valor a cada passo, o que não descreve
 *   uma projeção de mercado sensata)
 * @param months prazo em meses, inteiro ≥ 0 (0 = série de 1 ponto, sem
 *   nenhuma composição)
 * @param monthlyContribution aporte mensal em reais, ≥ 0 (default `0`, o
 *   comportamento pré-T-062)
 *
 * Entrada inválida (não finita, `currentValue`/`monthlyContribution`
 * negativos, taxa ≤ -100, `months` não inteiro ou negativo, ou estouro de
 * `number` na composição) devolve série **vazia** `[]` — nunca `NaN` num ponto
 * do gráfico. A validação é a do próprio `projectPortfolio`: se o prazo cheio
 * não produz projeção, não há série para desenhar.
 *
 * Séries longas são reamostradas para no máximo {@link MAX_SERIES_POINTS}
 * pontos (ver {@link resampleMonthIndices}), sempre preservando mês 0 e mês N.
 */
export function buildProjectionSeries(
  currentValue: number,
  monthlyRatePct: number,
  months: number,
  monthlyContribution = 0,
): ProjectionPoint[] {
  // Uma única chamada com o prazo cheio valida os quatro argumentos e detecta
  // overflow no ponto mais extremo da série antes de materializar nada.
  if (projectPortfolio(currentValue, monthlyRatePct, months, monthlyContribution) === null) {
    return [];
  }

  const monthIndices = resampleMonthIndices(months, MAX_SERIES_POINTS);
  const series: ProjectionPoint[] = [];
  for (const month of monthIndices) {
    // Um mês intermediário pode estourar mesmo com o prazo cheio válido? Não,
    // mas a checagem é barata e mantém a promessa de nunca emitir `NaN`.
    const point = projectPortfolio(currentValue, monthlyRatePct, month, monthlyContribution);
    if (point === null) return [];
    series.push({ month, value: point.futureValue });
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

/** Domínio de valores (eixo Y) já com margem, pronto para `scaleLinear`. */
export interface ValueDomain {
  min: number;
  max: number;
}

/** Fração do intervalo de valores usada como margem acima/abaixo (T-057b). */
const DOMAIN_PADDING_RATIO = 0.1;

/**
 * Calcula o domínio de valores (eixo Y) do gráfico de projeção (T-057b):
 * sempre inclui a `baseline` (valor inicial da simulação) além dos valores da
 * série, e adiciona uma margem de {@link DOMAIN_PADDING_RATIO} do intervalo
 * para a linha nunca tocar as bordas do desenho.
 *
 * A baseline já costuma estar implícita em `values` (é `series[0].value`),
 * mas o parâmetro é explícito e sempre considerado — o chamador não precisa
 * garantir que `values` inclui o mês 0.
 *
 * **Intervalo degenerado** (todos os valores iguais — ex.: taxa 0%, reta
 * horizontal): uma margem proporcional a um intervalo zero também seria zero,
 * então cai para uma margem baseada no valor absoluto da baseline (10% dela),
 * com piso {@link MIN_ABS_PADDING} para o caso `baseline === 0` (que geraria
 * margem 0 de novo).
 */
export function computeValueDomain(values: number[], baseline: number): ValueDomain {
  const all = [...values, baseline];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min;
  const padding =
    range > 0 ? range * DOMAIN_PADDING_RATIO : Math.max(Math.abs(baseline) * DOMAIN_PADDING_RATIO, MIN_ABS_PADDING);
  return { min: min - padding, max: max + padding };
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
