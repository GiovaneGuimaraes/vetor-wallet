import type { Db } from '@vetor-wallet/db';

export interface MockDb extends Db {
  execute: jest.Mock;
  batch: jest.Mock;
}

/**
 * `Db` de mentira para os testes das funções com I/O.
 *
 * É o ganho concreto da injeção: nenhuma suíte aqui precisa de banco
 * temporário, de `DATABASE_URL` setada antes de um `await import()` dinâmico,
 * nem de `initDb`. O teste declara o que o banco responde e verifica o SQL e os
 * `args` que a função emitiu.
 *
 * `execute` devolve `{ rows: [] }` por padrão — "não achou" é o caso mais comum
 * e evita `undefined.rows` quando o teste só se importa com uma das queries.
 */
export const createMockDb = (): MockDb => {
  return {
    execute: jest.fn().mockResolvedValue({ rows: [] }),
    batch: jest.fn().mockResolvedValue([]),
  } as unknown as MockDb;
};
