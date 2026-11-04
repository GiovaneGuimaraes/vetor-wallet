import type { BenchmarkSeriesPoint } from '@vetor-wallet/shared';
import type { BrapiHistoryPoint } from './types';

/**
 * Converte o histórico da brapi em série `{ date: YYYY-MM-DD, value: close }`
 * ordenada por data, descartando pontos sem fechamento positivo/finito e
 * deduplicando por data (o último ponto de uma data vence).
 */
export function buildIbovespaSeries(history: BrapiHistoryPoint[]): BenchmarkSeriesPoint[] {
  const byDate = new Map<string, number>();

  for (const point of history) {
    const ts = Number(point?.date);
    const close = Number(point?.close);
    if (!Number.isFinite(ts) || !Number.isFinite(close) || close <= 0) continue;
    const date = new Date(ts * 1000).toISOString().split('T')[0];
    byDate.set(date, close);
  }

  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
