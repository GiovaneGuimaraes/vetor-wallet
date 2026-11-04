import type { BenchmarkSeriesPoint } from '@vetor-wallet/shared';
import { bcbDateToIso } from './bcbDateToIso';
import type { BcbRateRow } from './types';

/**
 * Converte as taxas DIÁRIAS do CDI em uma série de índice acumulado
 * (base 100 antes do primeiro dia): o ponto de cada data vale
 * `100 × Π (1 + taxa_j/100)` para todas as taxas até ela, inclusive.
 *
 * O valor absoluto da base é irrelevante porque o cliente reancora a série
 * (razão entre pontos). Linhas com data em formato inesperado ou valor não
 * numérico são DESCARTADAS; a ordem de saída segue a de entrada.
 */
export function buildCdiIndexSeries(rows: BcbRateRow[]): BenchmarkSeriesPoint[] {
  const points: BenchmarkSeriesPoint[] = [];
  let accumulated = 100;

  for (const row of rows) {
    const date = bcbDateToIso(String(row?.data ?? ''));
    if (date === null) continue;
    const pct = Number(String(row?.valor ?? '').replace(',', '.'));
    if (!Number.isFinite(pct)) continue;

    accumulated *= 1 + pct / 100;
    points.push({ date, value: accumulated });
  }

  return points;
}
