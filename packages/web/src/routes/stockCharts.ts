import type { DailyClose } from '@vetor-wallet/shared';
import { changeTone, type ChangeTone } from './marketToday';

/**
 * Funções puras dos gráficos de ações de `/investimentos/acoes` (minigráfico
 * nas listas + gráfico expandido). Sem React, sem I/O.
 *
 * O histórico vem de `GET /api/market/history/:ticker`: fechamentos DIÁRIOS de
 * até 3 meses (o máximo do plano grátis da brapi). Os períodos 5D/1M/3M são
 * recortes desse mesmo histórico — trocar de período não faz requisição nova.
 * 1D/1A não existem de propósito: o plano grátis não entrega.
 */

/** Ticker do Ibovespa na brapi (índice, com `^`). */
export const IBOV_TICKER = '^BVSP';

export type ChartPeriod = '5D' | '1M' | '3M';
export const CHART_PERIODS: ChartPeriod[] = ['5D', '1M', '3M'];

/** Período do minigráfico das listas. */
export const SPARKLINE_PERIOD: ChartPeriod = '1M';

/** Subtrai `months` meses de uma data `YYYY-MM-DD` (dia ajustado ao fim do mês). */
function shiftMonthsBack(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Recorte do período, contado a partir do ÚLTIMO ponto (não de hoje — o
 * histórico pode estar algumas horas atrás): 5D = últimos 5 pregões; 1M = do
 * mesmo dia do mês anterior em diante; 3M = tudo. Espera `points` em ordem
 * crescente de data.
 */
export function slicePeriod(points: DailyClose[], period: ChartPeriod): DailyClose[] {
  if (points.length === 0 || period === '3M') return points;
  if (period === '5D') return points.slice(-5);
  const from = shiftMonthsBack(points[points.length - 1].date, 1);
  return points.filter((p) => p.date >= from);
}

export interface PeriodChange {
  start: number;
  end: number;
  abs: number;
  /** Variação em PERCENTUAL (2.5 = +2,5%); `null` se o preço inicial é 0. */
  pct: number | null;
}

/** Preço inicial/final e variação do período; menos de 2 pontos → `null`. */
export function periodChange(points: DailyClose[]): PeriodChange | null {
  if (points.length < 2) return null;
  const start = points[0].close;
  const end = points[points.length - 1].close;
  return { start, end, abs: end - start, pct: start === 0 ? null : ((end - start) / start) * 100 };
}

/** Cor da linha: alta (verde), baixa (vermelho) ou neutro, pelo % arredondado exibido. */
export function trendTone(points: DailyClose[]): ChangeTone {
  const change = periodChange(points);
  if (!change || change.pct === null) return 'flat';
  return changeTone(change.pct);
}

/**
 * `d` de um `<path>` de minigráfico: X por ÍNDICE (pregões sem buraco de fim
 * de semana), Y normalizado entre mínimo e máximo da série, com `pad` px de
 * respiro vertical. Série constante vira linha reta no meio. < 2 pontos → `null`.
 */
export function sparklinePath(
  values: number[],
  width: number,
  height: number,
  pad = 2
): string | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const stepX = width / (values.length - 1);
  const usable = height - pad * 2;
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = span === 0 ? height / 2 : pad + (1 - (v - min) / span) * usable;
      return `${i === 0 ? 'M' : 'L'}${round2(x)} ${round2(y)}`;
    })
    .join(' ');
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const fmtPoints = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Pontos de índice ("176.800 pts"). */
export function formatIndexPoints(value: number): string {
  return `${fmtPoints.format(value)} pts`;
}

/** Rótulo legível do ticker (`^BVSP` → `Ibovespa`). */
export function tickerLabel(ticker: string): string {
  return ticker === IBOV_TICKER ? 'Ibovespa' : ticker;
}
