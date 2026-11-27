import type { MarketQuote } from '@vetor-wallet/shared';

const BRAPI_LIST = 'https://brapi.dev/api/quote/list';
// `limit` máximo aceito pela brapi: o universo `type=stock` (~800 ativos) cabe
// numa página só. O endpoint é gratuito, dispensa token e não consome cota —
// por isso o token NÃO é enviado (não há o que ganhar e há o que vazar em URL).
const QUERY = 'type=stock&limit=1000';
const TIMEOUT_MS = 10_000;

interface RawStock {
  stock?: unknown;
  name?: unknown;
  close?: unknown;
  change?: unknown;
  volume?: unknown;
  market_cap?: unknown;
  sector?: unknown;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Busca o universo de ações do `/quote/list` e traduz para `MarketQuote`.
 * LANÇA em rede/timeout/status não-ok (quem decide degradar é o chamador).
 * Linha sem ticker, preço, variação ou volume numéricos é descartada.
 */
export async function fetchMarketList(): Promise<MarketQuote[]> {
  const res = await fetch(`${BRAPI_LIST}?${QUERY}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`brapi responded with ${res.status}`);
  const data = (await res.json()) as { stocks?: RawStock[] };

  const out: MarketQuote[] = [];
  for (const s of data.stocks ?? []) {
    if (typeof s.stock !== 'string' || !isNum(s.close) || !isNum(s.change) || !isNum(s.volume)) {
      continue;
    }
    out.push({
      ticker: s.stock,
      name: typeof s.name === 'string' ? s.name : s.stock,
      close: s.close,
      change: s.change,
      volume: s.volume,
      marketCap: isNum(s.market_cap) ? s.market_cap : null,
      sector: typeof s.sector === 'string' ? s.sector : null,
    });
  }
  return out;
}
