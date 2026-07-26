/**
 * Lógica pura de "saldo livre" da poupança (T-041).
 *
 * A transferência poupança → meta é um par WITHDRAW (sem vínculo) + DEPOSIT
 * (vinculado à meta) de mesmo valor: o efeito líquido no saldo é **zero**, o que
 * expressa que o dinheiro já estava na poupança e continua rendendo — só passa a
 * estar *reservado* para a meta. A invariante do saldo
 * (`DEPOSIT + YIELD − WITHDRAW`) fica intacta, e por isso o conceito que muda é
 * derivado na leitura:
 *
 *   saldo livre = saldo − Σ max(0, net vinculado de cada meta)
 *
 * Não há coluna nem materialização: nem de reservado, nem de saldo. O piso 0 por
 * meta espelha `resolveGoalProgress` (services/goals.ts) — uma meta cujas
 * retiradas vinculadas superam os aportes não devolve "reserva negativa" para
 * inflar o saldo livre das outras.
 *
 * Toda comparação de dinheiro aqui é feita em **centavos inteiros**: comparar
 * floats direto reprovaria uma transferência de exatamente o saldo livre quando
 * ele veio de somas como 0.1 + 0.2.
 */

/** Subconjunto de `SavingsEntry` de que o cálculo depende. */
export interface SavingsBalanceEntry {
  type: 'DEPOSIT' | 'WITHDRAW' | 'YIELD';
  amount: number;
  goal_id?: number | null;
}

/** Converte reais em centavos inteiros, para comparação exata de dinheiro. */
export function toCents(value: number): number {
  return Math.round(value * 100);
}

/** Arredonda para centavos, evitando ruído de ponto flutuante (0.1 + 0.2). */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Saldo da poupança: DEPOSIT + YIELD − WITHDRAW (mesma conta do `summary`). */
export function computeBalance(entries: SavingsBalanceEntry[]): number {
  let cents = 0;
  for (const entry of entries) {
    if (entry.type === 'WITHDRAW') cents -= toCents(entry.amount);
    else cents += toCents(entry.amount);
  }
  return cents / 100;
}

/**
 * Reservado por meta: DEPOSIT − WITHDRAW dos lançamentos vinculados àquela meta,
 * com piso 0. `YIELD` nunca entra (não pode ser vinculado — T-024), mas conta no
 * saldo, então rendimento aumenta o saldo livre.
 */
export function sumReservedByGoal(entries: SavingsBalanceEntry[]): Map<number, number> {
  const cents = new Map<number, number>();
  for (const entry of entries) {
    if (entry.goal_id == null) continue;
    if (entry.type !== 'DEPOSIT' && entry.type !== 'WITHDRAW') continue;
    const goalId = Number(entry.goal_id);
    const delta = entry.type === 'DEPOSIT' ? toCents(entry.amount) : -toCents(entry.amount);
    cents.set(goalId, (cents.get(goalId) ?? 0) + delta);
  }

  const reserved = new Map<number, number>();
  for (const [goalId, value] of cents) {
    reserved.set(goalId, Math.max(0, value) / 100);
  }
  return reserved;
}

/** Total reservado em metas — soma de `sumReservedByGoal` (piso 0 por meta). */
export function computeReservedTotal(entries: SavingsBalanceEntry[]): number {
  let cents = 0;
  for (const value of sumReservedByGoal(entries).values()) cents += toCents(value);
  return cents / 100;
}

/**
 * Saldo livre = saldo − reservado em metas. Pode ser **negativo** em bases
 * legadas (aportes vinculados criados antes da T-041 podem somar mais que o
 * saldo, por exemplo após uma retirada não vinculada); o valor é devolvido como
 * está e quem exibe aplica `max(0, …)`.
 */
export function computeFreeBalance(entries: SavingsBalanceEntry[]): number {
  return roundCents(computeBalance(entries) - computeReservedTotal(entries));
}

/**
 * T-052: guard explícito do 201 de `POST /api/savings/transfer-to-goal`.
 *
 * As duas pernas foram gravadas no MESMO `db.batch(..., 'write')` logo antes
 * do re-SELECT, então na prática ambas sempre existem — mas antes desta
 * checagem o handler fazia `.find(...) as SavingsEntry`, um cast que
 * mascararia silenciosamente um `undefined` (ex.: re-SELECT filtrado por um
 * `user_id` errado, ou uma corrida improvável no banco) atrás de um 201 com
 * uma perna faltando, em vez de um erro diagnosticável. Lançar aqui deixa o
 * `errorHandler` converter em 500 — nunca deveria acontecer, mas se acontecer
 * fica visível.
 */
export function pickTransferLegs<T extends { id: number | string | bigint }>(
  rows: T[],
  withdrawId: number,
  depositId: number,
): { withdraw: T; deposit: T } {
  const withdraw = rows.find((row) => Number(row.id) === withdrawId);
  const deposit = rows.find((row) => Number(row.id) === depositId);
  if (!withdraw || !deposit) {
    throw new Error('transferência gravada sem as duas pernas');
  }
  return { withdraw, deposit };
}
