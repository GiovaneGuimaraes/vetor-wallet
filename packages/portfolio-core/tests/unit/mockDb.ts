import type { Db } from '@vetor-wallet/db';

/**
 * `Db` de teste com o `execute` exposto como `jest.fn()` cru — o molde dos
 * testes portados do Vitest na fatia 2/2 da T-104, que configuravam o mock do
 * singleton com `mockResolvedValue`/`mockResolvedValueOnce` e liam
 * `mock.calls`. Injetar este `db` substitui o `vi.mock('@vetor-wallet/db')`
 * sem tocar nas assertivas. Para teste novo, prefira `makeTestDb` (`testDb.ts`).
 */
export function makeMockDb() {
  const mockExecute = jest.fn();
  const db = { execute: mockExecute, batch: jest.fn() } as unknown as Db;
  return { db, mockExecute };
}
