import type { Query } from '@vetor-wallet/query';
import { fetchQuotesStrict } from './fetchQuotesStrict';
import { resolveActiveTickers } from './resolveActiveTickers';
import { saveSnapshot } from './saveSnapshot';
import { withRetry } from './withRetry';

export interface RunSnapshotJobParams {
  query: Query;
}

/**
 * Fotografa o preço atual de todo ticker com posição aberta em
 * `quote_snapshots`. NUNCA rejeita por falha da brapi: depois dos retries,
 * loga e desiste — quem chama no boot não pode cair por isso.
 */
export async function runSnapshotJob(params: RunSnapshotJobParams): Promise<void> {
  const { query } = params;
  const tickers = await resolveActiveTickers({ query });
  if (tickers.length === 0) {
    console.log('[snapshots] No active tickers — skipping job');
    return;
  }

  let quotesMap: Map<string, number>;
  try {
    quotesMap = await withRetry(() => fetchQuotesStrict(tickers));
  } catch (err) {
    console.error('[snapshots] Failed to fetch quotes after retries:', err);
    return;
  }

  let saved = 0;
  for (const [ticker, price] of quotesMap) {
    const inserted = await saveSnapshot({ query, ticker, price });
    if (inserted) saved++;
  }

  const fetched = quotesMap.size;
  const duplicate = fetched - saved;
  console.log(
    `[snapshots] Job complete — ${saved} saved, ${duplicate} duplicate(s) skipped, ` +
      `${tickers.length - fetched} ticker(s) without quote`
  );
}
