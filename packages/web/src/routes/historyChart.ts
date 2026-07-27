import type { PortfolioHistoryPoint } from '@vetor-wallet/shared';
import { scaleLinear, type ValueDomain } from './chartGeometry';
import { MIN_ABS_PADDING } from './chartAxisFormat';

/**
 * Matemática pura do gráfico "Evolução da carteira" em `/dash` (T-058b) —
 * consome `GET /api/portfolio/history` (T-058a). Irmão de `chartGeometry.ts`
 * (reusa `scaleLinear`/`ValueDomain` de lá) mas com regras próprias deste
 * gráfico: o domínio precisa cobrir DUAS séries (`value` e `invested`, não
 * uma só como na projeção) e o eixo X mapeia **índice do ponto**, não o
 * calendário — a resposta do server pode ter dias ausentes (fim de semana,
 * sem preço, dias anteriores à 1ª operação) e não é uma série contígua.
 * Rotular cada tick com a data REAL daquele ponto (`point.date`) é o que
 * evita que o gráfico finja uma densidade de dias que a resposta não tem.
 */

/** Fração do intervalo de valores usada como margem acima/abaixo do eixo Y. */
const DOMAIN_PADDING_RATIO = 0.1;

/**
 * Domínio do eixo Y cobrindo `value` E `invested` de todos os pontos — a
 * linha de custo não pode ficar fora do desenho só porque a de valor de
 * mercado é maior/menor. `[]`/`[ponto único]` devolvem um domínio degenerado
 * centrado no único valor disponível (ou em 0 para série vazia), com a mesma
 * margem mínima de {@link MIN_ABS_PADDING} usada em `computeValueDomain`.
 *
 * `extraValues` (T-068) entra na mesma conta de min/max: são os valores das
 * linhas de benchmark VISÍVEIS, já convertidas para reais
 * (`benchmarkSeries.ts`). Sem isso, um CDI/Ibovespa que rendeu mais que a
 * carteira sairia do desenho. Ligar/desligar uma série muda o domínio, e é
 * intencional: o eixo se ajusta ao que está sendo comparado.
 */
export function computeHistoryDomain(
  points: PortfolioHistoryPoint[],
  extraValues: number[] = [],
): ValueDomain {
  const extras = extraValues.filter((v) => Number.isFinite(v));
  if (points.length === 0) {
    if (extras.length === 0) return { min: -MIN_ABS_PADDING, max: MIN_ABS_PADDING };
    return { min: Math.min(...extras) - MIN_ABS_PADDING, max: Math.max(...extras) + MIN_ABS_PADDING };
  }

  const all = [...points.flatMap((p) => [p.value, p.invested]), ...extras];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min;
  const padding =
    range > 0
      ? range * DOMAIN_PADDING_RATIO
      : Math.max(Math.abs(min) * DOMAIN_PADDING_RATIO, MIN_ABS_PADDING);
  return { min: min - padding, max: max + padding };
}

/**
 * Tendência da série (`value` do último ponto vs. do primeiro) — decide a cor
 * da linha/área, mesma semântica de P&L do resto do app (`--color-up`
 * quando o valor termina igual ou acima de onde começou, `--color-down`
 * quando termina abaixo). Série com menos de 2 pontos não tem "de-para" para
 * comparar e é tratada como neutra (`false` = não é queda).
 */
export function isHistoryDown(points: PortfolioHistoryPoint[]): boolean {
  if (points.length < 2) return false;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  return last < first;
}

/**
 * Escala do eixo X por ÍNDICE do ponto (0..pontos.length-1), não por data —
 * a resposta do server pode ter dias ausentes, então espaçar os pontos por
 * posição (e rotular cada tick com a data real desse índice) é o que evita
 * assumir uma série contígua de dias. `scaleLinear` já é seguro para domínio
 * degenerado (0 ou 1 ponto): devolve o centro do range.
 */
export function buildHistoryIndexScale(
  pointCount: number,
  rangeMin: number,
  rangeMax: number,
): (index: number) => number {
  return scaleLinear(0, Math.max(pointCount - 1, 0), rangeMin, rangeMax);
}
