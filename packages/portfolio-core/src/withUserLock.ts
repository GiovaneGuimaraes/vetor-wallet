/**
 * Lock por usuário, em memória (T-065): serializa seções críticas de
 * "checar depois agir" que dependem de contagem de carteiras — como
 * `POST /api/wallets`, que confere `countWallets(...) === 0` e só então
 * insere. Sem isso, dois POSTs simultâneos do mesmo usuário passam ambos pela
 * checagem antes de qualquer INSERT acontecer, e os dois criam carteira
 * (violando a regra "carteira única", T-050).
 *
 * Deliberadamente NÃO é um índice `UNIQUE(user_id)` no banco: quebraria o boot
 * de bases legadas com 2+ carteiras. O lock em memória resolve só a corrida de
 * escrita *nova*, sem tocar no schema — e basta porque o processo do server é
 * single-instance (não há múltiplos pods concorrendo pelo mesmo lock). Quando
 * a API virar Lambda (migração AWS), este lock deixa de valer entre
 * instâncias: é decisão daquela tarefa, não desta.
 *
 * O `Map` é estado de MÓDULO de propósito: o lock só funciona se todo chamador
 * compartilhar a mesma fila — não há `db` a injetar aqui.
 */
const userLocks = new Map<number, Promise<unknown>>();

export async function withUserLock<T>(userId: number, fn: () => Promise<T>): Promise<T> {
  const previous = userLocks.get(userId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  // Guarda a promise (sem propagar rejeição pro próximo da fila) só para
  // encadear a ordem; o valor/erro de fato é devolvido pelo `await run` abaixo.
  userLocks.set(
    userId,
    run.catch(() => undefined)
  );
  return run;
}
