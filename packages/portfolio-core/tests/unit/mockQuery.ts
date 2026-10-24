import type { Query } from '@vetor-wallet/query';

/**
 * `Query` de teste exposto como `jest.fn()` cru — o molde dos testes portados
 * do Vitest na fatia 2/2 da T-104 (lá era `makeMockDb`, com `execute`), que
 * configuram o mock com `mockResolvedValue`/`mockResolvedValueOnce` e leem
 * `mock.calls`. Trocado de `db` para `query` na T-114 sem mudar o que cada
 * teste prova. Para teste novo, prefira `makeTestQuery` (`testQuery.ts`).
 */
export function makeMockQuery() {
  const mockQuery = jest.fn();
  const query = mockQuery as unknown as Query;
  return { query, mockQuery };
}
