import type { Db } from '@vetor-wallet/db';
import type { Operation, OperationType } from '@vetor-wallet/shared';

export interface CreateOperationParams {
  db: Db;
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
 */
export async function createOperation(params: CreateOperationParams): Promise<Operation> {
  const { db, userId, walletId, ticker, type, quantity, price, date } = params;

  const insert = await db.execute({
    sql: 'INSERT INTO operations (ticker, type, quantity, price, date, user_id, wallet_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [ticker, type, quantity, price, date, userId, walletId],
  });

  const newId = insert.lastInsertRowid ?? 0;
  const row = await db.execute({
    sql: 'SELECT * FROM operations WHERE id = ? AND user_id = ?',
    args: [Number(newId), userId],
  });
  return row.rows[0] as unknown as Operation;
}
