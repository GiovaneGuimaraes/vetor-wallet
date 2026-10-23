import type { Query } from '@vetor-wallet/query';

export type MockQuery = Query & jest.Mock;

/**
 * `Query` de mentira para os testes das funções com I/O (T-114, passo 5).
 *
 * É o mesmo ganho que a injeção já dava com `db`: nenhuma suíte aqui precisa
 * de banco temporário, de `DATABASE_URL` setada antes de um `await import()`
 * dinâmico, nem de `initDb`/container Postgres. O teste declara o que a query
 * responde (`mockResolvedValue`/`mockImplementation`, roteada por trecho de
 * `text` quando a função dispara mais de um SELECT) e verifica o `text` e os
 * `values` emitidos. Substitui `createMockDb.ts` (`{ execute, batch }` do
 * libSQL) — não há `batch` porque `@vetor-wallet/query` não tem transação
 * interativa por proxy (dívida conhecida, ver `CLAUDE.md` do package).
 *
 * Devolve `{ rows: [], rowCount: 0 }` por padrão — "não achou" é o caso mais
 * comum e evita `undefined.rows` quando o teste só se importa com uma das
 * queries.
 */
export const createTestQuery = (): MockQuery => {
  return jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) as unknown as MockQuery;
};
