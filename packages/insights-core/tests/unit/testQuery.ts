import type { Query, QueryConfig, QueryResult } from '@vetor-wallet/query';

/**
 * `Query` de teste: um mock puro, como o contrato de `@vetor-wallet/query`
 * prevê (T-114, passo 5).
 *
 * Injetar o `query` é o que dispensa banco (SQLite ou Postgres) no teste.
 * `results` é consumido na ordem das chamadas; o que faltar volta como
 * resultado vazio.
 */
export function makeTestQuery(results: Array<Partial<QueryResult<unknown>>> = []) {
  const calls: Array<{ text: string; values: unknown }> = [];
  let i = 0;
  const query = jest.fn(async (input: QueryConfig | string) => {
    const { text, values } = typeof input === 'string' ? { text: input, values: [] } : input;
    calls.push({ text, values });
    const next = results[i++] ?? {};
    return { rows: [], rowCount: 0, ...next } as never;
  }) as unknown as Query;
  return { query, calls };
}
