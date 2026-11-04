import type { BenchmarkSeriesPoint } from '@vetor-wallet/shared';
import { buildCdiIndexSeries } from './buildCdiIndexSeries';
import { isoToBcbDate } from './isoToBcbDate';
import type { BcbRateRow } from './types';

const FETCH_TIMEOUT_MS = 5000;

/**
 * Série diária do CDI acumulado entre `from` e `to`. `null` em qualquer
 * falha (HTTP, timeout, JSON inesperado, série vazia).
 */
export async function fetchCdiSeries(
  from: string,
  to: string
): Promise<BenchmarkSeriesPoint[] | null> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${isoToBcbDate(
    from
  )}&dataFinal=${isoToBcbDate(to)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as BcbRateRow[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const series = buildCdiIndexSeries(data);
    return series.length > 0 ? series : null;
  } catch {
    return null;
  }
}
