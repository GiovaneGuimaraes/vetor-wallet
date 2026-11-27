import type { DailyClose, TickerHistory } from '@vetor-wallet/shared';
import { BrapiStatusError } from './BrapiStatusError';

const BRAPI_BASE = 'https://brapi.dev/api/quote';
/** Plano grátis: só `interval=1d` e no máximo `range=3mo` (1y/intradiário → 400). */
const QUERY = 'range=3mo&interval=1d';
// Igual ao da cotação: um histórico em voo segura cotações no máximo por isso.
const TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [500, 1500];

interface RawHistory {
  symbol?: unknown;
  shortName?: unknown;
  longName?: unknown;
  regularMarketPrice?: unknown;
  regularMarketChangePercent?: unknown;
  historicalDataPrice?: { date?: unknown; close?: unknown }[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const toDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * UMA requisição de histórico diário (3 meses) de UM ticker. Não passa pela
 * fila nem pelo cache — quem chama é `fetchDailyHistory`. LANÇA em
 * rede/timeout e em status não-ok (`BrapiStatusError`); 429 tem backoff curto
 * antes de desistir. Ponto sem data/fechamento numérico é descartado; `date`
 * (unix em segundos, meia-noite de Brasília) vira `YYYY-MM-DD` no fuso de SP.
 */
export async function requestDailyHistory(ticker: string): Promise<TickerHistory> {
  const token = process.env.BRAPI_TOKEN;
  const base = `${BRAPI_BASE}/${encodeURIComponent(ticker)}?${QUERY}`;
  const url = token ? `${base}&token=${token}` : base;

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt - 1]));
      continue;
    }
    if (!res.ok) throw new BrapiStatusError(res.status, ticker);

    const data = (await res.json()) as { results?: RawHistory[] };
    const raw = data.results?.find((r) => r.symbol === ticker) ?? data.results?.[0];
    const points: DailyClose[] = [];
    const seen = new Set<string>();
    for (const p of raw?.historicalDataPrice ?? []) {
      if (!isNum(p.date) || !isNum(p.close)) continue;
      const date = toDay.format(new Date(p.date * 1000));
      if (seen.has(date)) continue;
      seen.add(date);
      points.push({ date, close: p.close });
    }
    points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const name =
      typeof raw?.longName === 'string'
        ? raw.longName
        : typeof raw?.shortName === 'string'
          ? raw.shortName
          : null;
    return {
      ticker,
      name,
      price: isNum(raw?.regularMarketPrice) ? raw.regularMarketPrice : null,
      changePercent: isNum(raw?.regularMarketChangePercent) ? raw.regularMarketChangePercent : null,
      points,
      fetchedAt: new Date().toISOString(),
    };
  }
}
