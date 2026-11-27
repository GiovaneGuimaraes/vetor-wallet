/**
 * Coordenador de carregamento dos históricos dos gráficos (puro: o `fetcher` e
 * o relógio são injetados, sem React). Três regras:
 *
 * - **Cache por ticker** (`ttlMs`): a mesma Promise atende todos os
 *   minigráficos e o gráfico expandido do mesmo ativo — voltar à página ou
 *   abrir o gráfico grande não refaz a chamada.
 * - **Erro não fica em cache**: a próxima montagem tenta de novo.
 * - **Concorrência limitada** (`concurrency`): a lista inteira não dispara N
 *   requisições de uma vez. O servidor já serializa as idas à brapi; aqui é só
 *   para não afogar o navegador/servidor e deixar os primeiros chegarem logo
 *   (carregamento progressivo, na ordem pedida).
 */
export interface HistoryLoader<T> {
  load(ticker: string): Promise<T>;
  /** Só para teste. */
  reset(): void;
}

export function createHistoryLoader<T>(
  fetcher: (ticker: string) => Promise<T>,
  { concurrency, ttlMs, now = Date.now }: { concurrency: number; ttlMs: number; now?: () => number }
): HistoryLoader<T> {
  const cache = new Map<string, { promise: Promise<T>; expiresAt: number }>();
  const waiting: (() => void)[] = [];
  let active = 0;

  const acquire = (): Promise<void> => {
    if (active < concurrency) {
      active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
  };
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };

  return {
    load(ticker) {
      const hit = cache.get(ticker);
      if (hit && hit.expiresAt > now()) return hit.promise;

      const promise = acquire().then(async () => {
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
      waiting.length = 0;
      active = 0;
    },
  };
}
