import type { Db } from '@vetor-wallet/db';

/**
 * `Db` + transação interativa.
 *
 * O contrato `Db` de `@vetor-wallet/db` é deliberadamente estreito (só
 * `execute` e `batch`): transação é gestão de conexão, e gestão de conexão não
 * é assunto de core. **Este package é a exceção, e é uma só**:
 * `createRecurringExpenseEntry` precisa encadear três escritas em que a segunda
 * e a terceira dependem do `lastInsertRowid` da primeira — um `batch` não expõe
 * o resultado de uma instrução para as seguintes.
 *
 * Em vez de alargar o `Db` de todo mundo por causa de uma função, o tipo mais
 * largo vive aqui, ao lado de quem precisa dele. Quem chama continua passando o
 * mesmo client de sempre.
 *
 * Os tipos de instrução e resultado são derivados do próprio `Db` — assim este
 * arquivo não ganha uma dependência de `@libsql/client` só para nomeá-los, e
 * não há como os dois divergirem.
 *
 * **Atenção para o passo 5 da migração** (`docs/multi-agent/plano-migracao-aws.md`):
 * transação interativa **não sobrevive** a um proxy por instrução como o
 * `lambda-postgres-query`. No Postgres o equivalente é uma instrução só, com
 * CTE (`WITH ins AS (INSERT ... RETURNING id) INSERT ...`) — o que aliás
 * dispensa a transação. É a única função do repo com esse problema, e está
 * isolada aqui de propósito.
 */
type Statement = Parameters<Db['execute']>[0];
type Result = Awaited<ReturnType<Db['execute']>>;

export interface Transaction {
  execute(stmt: Statement): Promise<Result>;
  commit(): Promise<void>;
  close(): void;
}

export interface TransactionalDb extends Db {
  transaction(mode: 'write' | 'read' | 'deferred'): Promise<Transaction>;
}
