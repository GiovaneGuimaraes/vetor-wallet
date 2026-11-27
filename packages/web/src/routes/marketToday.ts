import type { MarketQuote } from '@vetor-wallet/shared';

/**
 * Funções puras da seção "Mercado hoje" (`components/MarketToday.tsx`).
 * Sem React, sem I/O — convenção de `fixedIncome.ts`/`homeMetrics.ts`.
 */

const fmtBrl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtCompact = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatPrice(value: number): string {
  return fmtBrl.format(value);
}

/** Variação % com sinal explícito: "+3,20%", "-1,05%", "0,00%". */
export function formatChange(pct: number): string {
  const rounded = Math.round(pct * 100) / 100;
  if (rounded === 0) return '0,00%';
  return `${rounded > 0 ? '+' : '-'}${fmtPct.format(Math.abs(rounded))}%`;
}

export type ChangeTone = 'up' | 'down' | 'flat';

/** Tom da cor: decidido pelo valor ARREDONDADO exibido (0,004% mostra "0,00%", logo neutro). */
export function changeTone(pct: number): ChangeTone {
  const rounded = Math.round(pct * 100) / 100;
  return rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
}

/** Volume financeiro do dia, compacto: "R$ 1,2 mi". */
export function formatTradedValue(q: MarketQuote): string {
  return `R$ ${fmtCompact.format(q.close * q.volume)}`;
}

/** Horário do dado em pt-BR no fuso de Brasília ("26/11 12:00"); ISO inválido → null. */
export function formatAsOf(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`;
}

/** Tickers que o usuário tem em carteira (posição aberta), para marcar nas listas. */
export function ownedTickerSet(positions: { ticker: string }[] | null | undefined): Set<string> {
  return new Set((positions ?? []).map((p) => p.ticker.toUpperCase()));
}
