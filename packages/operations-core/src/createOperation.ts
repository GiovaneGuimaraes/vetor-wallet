import type { Query } from '@vetor-wallet/query';
import type { Operation, OperationType } from '@vetor-wallet/shared';

export interface CreateOperationParams {
  query: Query;
  userId: number;
  /** Carteira padrão do usuário, resolvida pelo chamador (T-050). */
  walletId: number;
  /** Já normalizado em MAIÚSCULAS pelo chamador. */
  ticker: string;
  type: OperationType;
  quantity: number;
  price: number;
  /** YYYY-MM-DD */
  date: string;
}

/**
 * Grava uma operação e devolve a linha criada.
 *
 * `walletId` vem do chamador, que o resolve por `getOrCreateDefaultWallet`
 * (`@vetor-wallet/portfolio-core`) — **nunca** do corpo da request: desde a
 * T-050 o `wallet_id` enviado pelo cliente é ignorado, o que de quebra fecha o
 * buraco de gravar numa carteira de outro usuário.
 *
 * O re-SELECT é filtrado por `user_id` (T-059, simetria com o PATCH — T-051):
 * ler de volta só pelo `id` recém-criado funcionaria, mas abriria um caminho de
 * leitura sem dono, e a regra do app é que **toda** consulta carregue o usuário
 * na cláusula.
 *
 * `RETURNING id` no lugar do `lastInsertRowid` do SQLite (T-114, passo 5 de
 * `docs/multi-agent/plano-migracao-aws.md`) — o mesmo formato nos dois
 * backends do `@vetor-wallet/query`.
 */
export async function createOperation(params: CreateOperationParams): Promise<Operation> {
  const { query, userId, walletId, ticker, type, quantity, price, date } = params;

  const insert = await query<{ id: number }>({
    text: 'INSERT INTO operations (ticker, type, quantity, price, date, user_id, wallet_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    values: [ticker, type, quantity, price, date, userId, walletId],
  });

  const newId = insert.rows[0]?.id ?? 0;
  const row = await query<Operation>({
    text: 'SELECT * FROM operations WHERE id = $1 AND user_id = $2',
    values: [newId, userId],
  });
  return row.rows[0];
}
