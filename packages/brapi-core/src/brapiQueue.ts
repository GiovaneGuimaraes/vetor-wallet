/**
 * Fila global do processo para TODA ida à brapi que gasta cota (`/api/quote/...`):
 * o plano grátis permite 1 requisição simultânea (concorrência → 429), e
 * `/api/portfolio`, `/api/benchmarks` e os históricos dos gráficos chegam juntos
 * do web. Cotação (`quotes.ts`) e histórico diário (`fetchDailyHistory.ts`)
 * entram na MESMA fila — nunca 2 chamadas à brapi em voo no processo.
 * (`/quote/list`, grátis e sem cota, não passa por aqui.)
 *
 * **Prioridade**: cotação SEMPRE passa à frente de histórico. São duas filas
 * lógicas servidas por um único executor: o próximo job é a cotação mais
 * antiga pendente; histórico só roda quando não há cotação esperando. Sem
 * isso, com cache frio os ~16 históricos da página entravam na frente das
 * cotações da carteira e estouravam o teto de 10 s do modo tolerante
 * (carteira "sem cotação"). Não há preempção: uma cotação que chega com um
 * histórico em voo espera só aquele terminar (cada requisição tem timeout).
 */
export type BrapiPriority = 'quote' | 'history';

const queues: Record<BrapiPriority, (() => Promise<void>)[]> = { quote: [], history: [] };
let running = false;
/** Invalida executores antigos em `_resetBrapiQueue` (testes). */
let generation = 0;

async function pump(gen: number): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (gen === generation) {
      const next = queues.quote.shift() ?? queues.history.shift();
      if (!next) break;
      await next(); // nunca lança: o job é embrulhado em enqueueBrapi
    }
  } finally {
    if (gen === generation) running = false;
  }
}

/**
 * Enfileira uma ida à brapi. O job começa num microtask (nunca síncrono), um
 * por vez; erro/timeout de um job rejeita só a Promise dele e a fila segue.
 */
export function enqueueBrapi<T>(
  job: () => Promise<T>,
  priority: BrapiPriority = 'quote'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queues[priority].push(async () => {
      try {
        resolve(await job());
      } catch (err) {
        reject(err);
      }
    });
    const gen = generation;
    queueMicrotask(() => void pump(gen));
  });
}

/** Só para teste. */
export function _resetBrapiQueue(): void {
  generation++;
  queues.quote.length = 0;
  queues.history.length = 0;
  running = false;
}
