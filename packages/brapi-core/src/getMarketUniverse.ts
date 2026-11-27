import type { MarketQuote } from '@vetor-wallet/shared';
import { fetchMarketList } from './fetchMarketList';

/** Cache curto: cotação do dia envelhece rápido, ao contrário da lista de tickers (24h). */
export const MARKET_CACHE_TTL_MS = 15 * 60 * 1000;

export interface MarketUniverse {
  quotes: MarketQuote[];
  /** Quando a brapi foi de fato consultada — não quando o cache foi lido. */
  fetchedAt: number;
}

let marketCache: MarketUniverse | null = null;

/**
 * Universo de ações com cache em memória de 15 min, SEPARADO do cache de 24h
 * da busca de tickers. Se a brapi falhar e houver cache (mesmo vencido),
 * devolve o stale com o `fetchedAt` original — o horário mostrado ao usuário
 * continua honesto. Sem nenhum cache, lança.
 */
export async function getMarketUniverse(now: number = Date.now()): Promise<MarketUniverse> {
  if (marketCache && now - marketCache.fetchedAt < MARKET_CACHE_TTL_MS) return marketCache;
  try {
    marketCache = { quotes: await fetchMarketList(), fetchedAt: now };
    return marketCache;
  } catch (err) {
    if (marketCache) return marketCache;
    throw err;
  }
}

export function _resetMarketCache(): void {
  marketCache = null;
}
