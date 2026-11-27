/**
 * Coordenador de carregamento dos históricos dos gráficos (puro: o `fetcher` e
 * o relógio são injetados, sem React). Quatro regras:
 *
 * - **Cache por ticker** (`ttlMs`): a mesma Promise atende todos os
 *   minigráficos e o gráfico expandido do mesmo ativo — voltar à página ou
 *   abrir o gráfico grande não refaz a chamada.
 * - **Erro não fica em cache**: a próxima montagem tenta de novo.
 * - **Concorrência limitada** (`concurrency`): a lista inteira não dispara N
 *   requisições de uma vez (o servidor já serializa as idas à brapi).
 * - **Prioridade**: `high` (posições da carteira, gráfico aberto) sai antes de
 *   `low` (Mercado hoje); dentro de cada uma, na ordem pedida. Um ticker que
 *   espera como `low` e é pedido como `high` sobe de fila.
 */
export type LoadPriority = 'high' | 'low';

export interface HistoryLoader<T> {
  load(ticker: string, priority?: LoadPriority): Promise<T>;
  /** Só para teste. */
  reset(): void;
}

interface Waiter {
  ticker: string;
  start: () => void;
}

export function createHistoryLoader<T>(
  fetcher: (ticker: string) => Promise<T>,
  { concurrency, ttlMs, now = Date.now }: { concurrency: number; ttlMs: number; now?: () => number }
): HistoryLoader<T> {
  const cache = new Map<string, { promise: Promise<T>; expiresAt: number }>();
  const waiting: Record<LoadPriority, Waiter[]> = { high: [], low: [] };
  let active = 0;

  const acquire = (ticker: string, priority: LoadPriority): Promise<void> => {
    if (active < concurrency) {
      active++;
      return Promise.resolve();
    }
    return new Promise((start) => waiting[priority].push({ ticker, start }));
  };
  const release = () => {
    const next = waiting.high.shift() ?? waiting.low.shift();
    if (next) next.start();
    else active--;
  };
  const promote = (ticker: string) => {
    const i = waiting.low.findIndex((w) => w.ticker === ticker);
    if (i >= 0) waiting.high.push(...waiting.low.splice(i, 1));
  };

  return {
    load(ticker, priority = 'low') {
      const hit = cache.get(ticker);
      if (hit && hit.expiresAt > now()) {
        if (priority === 'high') promote(ticker);
        return hit.promise;
      }

      const promise = acquire(ticker, priority).then(async () => {
        try {
          return await fetcher(ticker);
        } finally {
          release();
        }
      });
      const entry = { promise, expiresAt: now() + ttlMs };
      cache.set(ticker, entry);
      promise.catch(() => {
        if (cache.get(ticker) === entry) cache.delete(ticker);
      });
      return promise;
    },
    reset() {
      cache.clear();
      waiting.high.length = 0;
      waiting.low.length = 0;
      active = 0;
    },
  };
}
