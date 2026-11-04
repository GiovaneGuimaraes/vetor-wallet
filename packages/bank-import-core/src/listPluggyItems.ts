import type { Query } from '@vetor-wallet/query';
import type { PluggyItem } from './PluggyItem';
import { toPluggyItem } from './toPluggyItem';

export interface ListPluggyItemsParams {
  query: Query;
  userId: number;
}

/**
 * Os items de UM usuário, em ordem de criação (T-089a).
 *
 * É a consulta que o job de sincronização faz no lugar de ler `PLUGGY_ITEM_ID`,
 * e o índice `idx_pluggy_items_user (user_id, created_at)` existe para ela.
 * **Sempre filtrada por `user_id`** — não existe leitura "todos os items", nem
 * mesmo para o job: quem quer sincronizar N usuários itera usuários e chama isto
 * N vezes, e assim nenhum caminho de código pode devolver item alheio.
 */
export async function listPluggyItems(params: ListPluggyItemsParams): Promise<PluggyItem[]> {
  const { query, userId } = params;
  const result = await query({
    text: `SELECT * FROM pluggy_items WHERE user_id = $1 ORDER BY created_at, id`,
    values: [userId],
  });
  return result.rows.map(toPluggyItem);
}
