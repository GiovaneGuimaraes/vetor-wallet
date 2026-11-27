/**
 * Fila global do processo para TODA ida à brapi que gasta cota (`/api/quote/...`):
 * o plano grátis permite 1 requisição simultânea (concorrência → 429), e
 * `/api/portfolio`, `/api/benchmarks` e os históricos dos gráficos chegam juntos
 * do web. Cotação (`quotes.ts`) e histórico diário (`fetchDailyHistory.ts`)
 * entram na MESMA fila — nunca 2 chamadas à brapi em voo no processo.
 * (`/quote/list`, grátis e sem cota, não passa por aqui.)
 */
let queueTail: Promise<unknown> = Promise.resolve();

export function enqueueBrapi<T>(job: () => Promise<T>): Promise<T> {
  const run = queueTail.then(job);
  queueTail = run.catch(() => undefined);
  return run;
}

/** Só para teste. */
export function _resetBrapiQueue(): void {
  queueTail = Promise.resolve();
}
