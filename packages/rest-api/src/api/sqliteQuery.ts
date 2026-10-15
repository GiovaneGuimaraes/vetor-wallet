import type { InStatement } from '@libsql/client';
import type { Db } from '@vetor-wallet/db';
import type { Query, QueryConfig, QueryResult } from '@vetor-wallet/query';

/**
 * Adapta o `Db` (libSQL) de hoje ao contrato `Query` que os `*-core`
 * migrados para o passo 5 de `docs/multi-agent/plano-migracao-aws.md` esperam
 * (T-113).
 *
 * Só existe enquanto o `rest-api` ainda fala com SQLite — os passos 6 a 8 da
 * fase 1 (VPC, Aurora, migração dos dados) estão parados por decisão do
 * humano. Até lá, um core trocado de `db` para `query` continua rodando local
 * sem Postgres nenhum: é este adaptador que fecha a ponta, aqui, no único
 * lugar onde a rota escolhe o client. Quando o passo 6 ligar o Postgres de
 * verdade, a troca é `createSqliteQuery(db)` → `createPgQuery(...)`, sem
 * tocar nenhum core.
 *
 * Converte `$1, $2, ...` (convenção do Postgres, usada pelo `Query`) para `?`
 * (convenção do libSQL), na ORDEM de aparição no texto — os cores migrados não
 * reusam o mesmo placeholder duas vezes dentro da mesma query, então a ordem
 * de aparição sempre casa com a ordem do array `values`.
 */
export function createSqliteQuery(db: Db): Query {
  return (async <Row>(input: QueryConfig | string): Promise<QueryResult<Row>> => {
    const { text, values } = typeof input === 'string' ? { text: input, values: [] } : input;
    const sql = text.replace(/\$\d+/g, '?');
    const stmt = { sql, args: values ?? [] } as unknown as InStatement;
    const result = await db.execute(stmt);
    return {
      rows: result.rows as unknown as Row[],
      rowCount: result.rowsAffected,
    };
  }) as Query;
}
