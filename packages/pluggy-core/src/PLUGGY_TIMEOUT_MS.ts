/**
 * Timeout de cada request à Pluggy.
 *
 * 15s (e não os 5s da brapi): a brapi devolve cotação de cache e degrada em
 * silêncio, enquanto aqui cada página pode trazer até 500 transações de um
 * agregador que consulta a instituição financeira por trás. Um timeout curto
 * transformaria lentidão do banco em falha da sincronização inteira.
 */
export const PLUGGY_TIMEOUT_MS = 15_000;
