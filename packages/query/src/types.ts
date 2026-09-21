/**
 * O contrato que os `*-core` vão receber por injeção no lugar do `Db` de hoje.
 *
 * É deliberadamente o shape do `pg` (`{ text, values }`), e não uma abstração
 * nossa: é o mesmo formato do `@ttoss/lambda-postgres-query` que a OCA roda em
 * produção, e copiar a referência é mais barato que inventar uma tradução.
 *
 * Diferenças em relação ao `Db` do SQLite, que é o trabalho do passo 5:
 * - `text`/`values`, não `sql`/`args`;
 * - `$1`, `$2`, não `?`;
 * - `RETURNING id` no lugar de `lastInsertRowid`;
 * - `rowCount` no lugar de `rowsAffected`;
 * - código de erro `23505` no lugar do `SQLITE_CONSTRAINT_UNIQUE`.
 */
export interface QueryConfig {
  text: string;
  values?: unknown[];
}

export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

/** A função que cada core recebe. Uma só, igual nos dois backends. */
export type Query = <Row = Record<string, unknown>>(
  config: QueryConfig | string
) => Promise<QueryResult<Row>>;
