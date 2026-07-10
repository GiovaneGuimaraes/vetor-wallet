import { db } from '../db';
import { fetchQuotes } from './quotes';
import { buildPositionMap, buildPortfolioSummary } from './portfolio';
import type { Operation } from '@vetor-wallet/shared';

function toDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export async function fetchCDIAccumulated(from: string, to: string): Promise<number | null> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${toDateBR(from)}&dataFinal=${toDateBR(to)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { data: string; valor: string }[];
    if (!data.length) return null;

    let accumulated = 1;
    for (const { valor } of data) {
      accumulated *= 1 + parseFloat(valor.replace(',', '.')) / 100;
    }
    return (accumulated - 1) * 100;
  } catch {
    return null;
  }
}

export async function fetchIbovespaReturn(from: string): Promise<number | null> {
  const token = process.env.BRAPI_TOKEN;
  const tokenParam = token ? `&token=${token}` : '';
  const url = `https://brapi.dev/api/quote/%5EBVSP?range=5y&interval=1mo&fundamental=false&history=true${tokenParam}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      results?: { historicalDataPrice?: { date: number; close: number }[] }[];
    };

    const history = data.results?.[0]?.historicalDataPrice;
    if (!history || history.length < 2) return null;

    const fromTs = new Date(from + 'T00:00:00Z').getTime() / 1000;
    const sorted = [...history].sort((a, b) => a.date - b.date);
    const startPoint = sorted.find((p) => p.date >= fromTs) ?? sorted[0];
    const endPoint = sorted[sorted.length - 1];

    if (!startPoint?.close || !endPoint?.close) return null;
    return ((endPoint.close - startPoint.close) / startPoint.close) * 100;
  } catch {
    return null;
  }
}

export async function getPortfolioReturnAndEarliestDate(): Promise<{
  pct: number | null;
  earliestDate: string | null;
}> {
  try {
    const result = await db.execute('SELECT * FROM operations ORDER BY date ASC, created_at ASC');
    const ops = result.rows as unknown as Operation[];
    if (!ops.length) return { pct: null, earliestDate: null };

    const earliestDate = ops[0].date;
    const positionMap = buildPositionMap(ops);
    const activeTickers: string[] = [];
    for (const [ticker, pos] of positionMap.entries()) {
      if (pos.quantity > 0) activeTickers.push(ticker);
    }

    const quotes = await fetchQuotes(activeTickers);
    const summary = buildPortfolioSummary(positionMap, quotes);
    return { pct: summary.totalProfitLossPct, earliestDate };
  } catch {
    return { pct: null, earliestDate: null };
  }
}
