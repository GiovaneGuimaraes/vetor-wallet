import type { InStatement, ResultSet, TransactionMode } from '@libsql/client';

/**
 * Contrato mínimo de acesso ao banco que os `*-core` recebem **por injeção**.
 *
 * Um core nunca importa o singleton `db` deste package: quem tem I/O declara
 * `db: Db` no objeto de argumentos e recebe o client de quem o chamou (rota,
 * job, teste). Duas consequências, nessa ordem de importância:
 *
 * 1. **Teste vira mock puro** — `{ execute: jest.fn(), batch: jest.fn() }`
 *    satisfaz o tipo. Não é preciso banco temporário, nem `DATABASE_URL` antes
 *    de um `await import()` dinâmico só porque o client lê o env no top-level
 *    do módulo.
 * 2. **A conexão é decisão de quem orquestra**, não do domínio — trocar o
 *    client (Turso, transação aberta, réplica de leitura) não toca regra de
 *    negócio.
 *
 * É deliberadamente mais estreito que o `Client` do libsql: só `execute` e
 * `batch`. O que não está aqui (`transaction`, `sync`, `close`) é gestão de
 * conexão, que não é assunto de core.
 */
export interface Db {
  execute(stmt: InStatement): Promise<ResultSet>;
  batch(stmts: InStatement[], mode?: TransactionMode): Promise<ResultSet[]>;
}
