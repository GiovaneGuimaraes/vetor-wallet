import type { BenchmarkSeriesPoint } from '@vetor-wallet/shared';
import { brapiRangeForDays } from './brapiRangeForDays';
import { buildIbovespaSeries } from './buildIbovespaSeries';
import { clampSeriesToWindow } from './clampSeriesToWindow';
import type { BrapiHistoryPoint } from './types';

const FETCH_TIMEOUT_MS = 5000;

/**
 * Série diária de fechamento do Ibovespa (`^BVSP`) cobrindo `days` dias,
 * recortada a `[from, to]`. `null` em qualquer falha.
 */
export async function fetchIbovespaSeries(
  from: string,
  to: string,
  days: number
): Promise<BenchmarkSeriesPoint[] | null> {
  const token = process.env.BRAPI_TOKEN;
  const tokenParam = token ? `&token=${token}` : '';
  const range = brapiRangeForDays(days);
  const url = `https://brapi.dev/api/quote/%5EBVSP?range=${range}&interval=1d&fundamental=false&history=true${tokenParam}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      results?: { historicalDataPrice?: BrapiHistoryPoint[] }[];
    };
    const history = data.results?.[0]?.historicalDataPrice;
    if (!Array.isArray(history) || history.length === 0) return null;

    const series = clampSeriesToWindow(buildIbovespaSeries(history), from, to);
    return series.length > 0 ? series : null;
  } catch {
    return null;
  }
}
