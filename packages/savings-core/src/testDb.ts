import { vi } from 'vitest';
import type { Db } from '@vetor-wallet/db';

/**
 * `Db` de teste: um mock puro, como o contrato de `@vetor-wallet/db` prevê.
 *
 * Injetar o `db` é o que dispensa banco temporário e `DATABASE_URL` setado
 * antes de um `await import()` dinâmico. `results` é consumido na ordem das
 * chamadas de `execute`; o que faltar volta como resultado vazio.
 */
export function makeTestDb(
  results: Array<Partial<{ rows: unknown[]; lastInsertRowid: bigint; rowsAffected: number }>> = []
) {
  const calls: Array<{ sql: string; args: unknown }> = [];
  let i = 0;
  const db = {
    execute: vi.fn(async (stmt: { sql: string; args?: unknown }) => {
      calls.push({ sql: stmt.sql, args: stmt.args });
      const next = results[i++] ?? {};
      return { rows: [], rowsAffected: 0, ...next } as never;
    }),
    batch: vi.fn(async () => [] as never),
  } as unknown as Db;
  return { db, calls };
}
