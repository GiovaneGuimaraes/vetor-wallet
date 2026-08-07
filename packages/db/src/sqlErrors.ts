/**
 * Classificação de erros do driver SQL (`@libsql/client`).
 *
 * Módulo neutro extraído de `recurringExpenses.ts` na T-084: o dedupe de
 * importação de renda/despesa também precisa distinguir violação de unicidade,
 * e importar isso de dentro do módulo de recorrência amarraria dois domínios
 * sem relação. `recurringExpenses.ts` re-exporta daqui para não quebrar quem
 * já importava de lá.
 */

/**
 * `true` para violação de índice/chave única (ex.: a corrida de duas
 * materializações do mesmo mês na T-035, ou o mesmo `external_id` importado
 * duas vezes na T-084). Qualquer outro erro de banco tem de continuar subindo
 * (o handler global responde 500) em vez de virar um caso "esperado" silencioso.
 */
export function isUniqueViolation(err: unknown): boolean {
  // Só unicidade: `SQLITE_CONSTRAINT` genérico inclui FK/NOT NULL, que são bugs
  // e não corrida — engoli-los esconderia defeito real.
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return true;
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed/i.test(message);
}
