import type { Db } from '@vetor-wallet/db';

export interface UnlinkPluggyItemParams {
  db: Db;
  userId: number;
  itemId: string;
}

/**
 * Remove o vínculo de um item com o usuário (T-089a).
 *
 * - **`DELETE … WHERE user_id = ? AND item_id = ?`**: item de outro usuário
 *   simplesmente não casa e a função devolve `false`. O chamador responde
 *   "não encontrado" — nunca um 403, que confirmaria a existência do vínculo
 *   alheio (mesma regra do resto das rotas de dados).
 * - **Devolve `false` também quando o item nunca existiu.** Os dois casos são
 *   indistinguíveis de propósito.
 * - Só apaga a linha NOSSA. Revogar a conexão do lado da Pluggy
 *   (`DELETE /items/{id}`) é chamada de Integração e cabe a quem orquestra
 *   (rota da fase (b)) — este core não fala com terceiro.
 */
export async function unlinkPluggyItem(params: UnlinkPluggyItemParams): Promise<boolean> {
  const { db, userId } = params;
  const itemId = typeof params.itemId === 'string' ? params.itemId.trim() : '';
  if (!itemId) return false;

  const result = await db.execute({
    sql: `DELETE FROM pluggy_items WHERE user_id = ? AND item_id = ?`,
    args: [userId, itemId],
  });
  return Number(result.rowsAffected ?? 0) > 0;
}
