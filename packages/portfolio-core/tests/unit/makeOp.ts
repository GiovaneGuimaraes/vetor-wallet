import type { Operation } from '@vetor-wallet/shared';

/** Operação mínima para os testes de posição — data fixa, só o que a regra lê importa. */
export function makeOp(
  ticker: string,
  type: 'BUY' | 'SELL',
  quantity: number,
  price: number,
  id = 1
): Operation {
  return { id, ticker, type, quantity, price, date: '2024-01-01', created_at: '2024-01-01' };
}
