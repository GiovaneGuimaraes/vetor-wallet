import type { BenchmarkSeriesPoint } from '@vetor-wallet/shared';
import type { BrapiHistoryPoint } from './types';

// BRT = UTC-3, sem horário de verão desde 2019 (mesmo deslocamento do
// `getBRTDate` do portfolio-core, que ancora a janela da rota). T-119.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

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
    // Data em BRT (UTC-3 fixo), o mesmo fuso da âncora da rota (`getBRTDate`).
    const date = new Date(ts * 1000 - BRT_OFFSET_MS).toISOString().split('T')[0];
    byDate.set(date, close);
  }

  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
