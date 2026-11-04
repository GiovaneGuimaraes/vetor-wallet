import type { BenchmarkSeriesPoint } from '@vetor-wallet/shared';

/** Recorta a série ao intervalo `[from, to]` (inclusivo, comparação lexicográfica de ISO). */
export function clampSeriesToWindow(
  series: BenchmarkSeriesPoint[],
  from: string,
  to: string
): BenchmarkSeriesPoint[] {
  return series.filter((p) => p.date >= from && p.date <= to);
}
