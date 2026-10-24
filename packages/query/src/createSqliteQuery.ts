import type { InStatement } from '@libsql/client';
import type { Db } from '@vetor-wallet/db';
import type { Query, QueryConfig, QueryResult } from './types';

/**
 * Terceiro backend do `Query`, ao lado de `createPgQuery`/`createLambdaQuery`:
 * adapta o `Db` (libSQL) de hoje ao contrato que os `*-core` migrados no passo
 * 5 de `docs/multi-agent/plano-migracao-aws.md` esperam (T-113).
 *
 * Nasceu em `rest-api/src/api/sqliteQuery.ts` e veio para cá na T-114 (fatia
 * `portfolio-core`): um core nunca importa do `rest-api`, e o `auth-core`
 * precisa do adaptador para chamar `getOrCreateDefaultWallet` — então ele mora
 * aqui, acessível a qualquer chamador (rota, boot ou core).
 *
 * Existe enquanto o app ainda fala com SQLite — os passos 6 a 8 da fase 1 (VPC,
 * Aurora, migração dos dados) estão parados por decisão do humano. Quando o
 * passo 6 ligar o Postgres de verdade, a troca é `createSqliteQuery(db)` →
 * `createPgQuery(...)` em quem constrói o client, sem tocar nenhum core.
 *
 * Converte `$1, $2, ...` (convenção do Postgres, usada pelo `Query`) para `?`
 * (convenção do libSQL), na ORDEM de aparição no texto — os cores migrados não
 * reusam o mesmo placeholder duas vezes dentro da mesma query, então a ordem
 * de aparição sempre casa com a ordem do array `values`.
 *
 * `@vetor-wallet/db` entra só pelo TIPO `Db`: importar este package não abre
 * conexão nenhuma — quem passa o `db` é o chamador.
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
