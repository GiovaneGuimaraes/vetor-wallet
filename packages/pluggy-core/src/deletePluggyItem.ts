import { pluggySend } from './pluggySend';
import { PluggyApiError } from './PluggyApiError';

/**
 * `DELETE /items/{id}` → revoga a conexão do lado da Pluggy (T-089b).
 *
 * Fecha a pendência que a T-089a deixou aberta: `unlinkPluggyItem` apaga só a
 * **nossa** linha em `pluggy_items`. Sem esta chamada, o item continuaria vivo
 * na Pluggy, sincronizando com o banco do usuário e — no plano pago — sendo
 * cobrado, depois de ele ter clicado em "desconectar" e visto o item sumir da
 * tela. Desconectar tem de desconectar de verdade.
 *
 * **404 conta como sucesso.** O item já não existe na Pluggy (apagado por lá,
 * ou uma primeira tentativa que falhou depois de já ter revogado): o desfecho
 * que o usuário pediu — "não quero mais esta conexão" — está satisfeito, e
 * transformar isso em erro deixaria a linha órfã no nosso banco para sempre,
 * sem caminho de saída pela UI. É a mesma doutrina do dedupe da T-084: o estado
 * final desejado é o que importa, não quantas vezes se chegou nele.
 */
export async function deletePluggyItem(itemId: string): Promise<void> {
  const id = itemId.trim();
  if (!id) throw new PluggyApiError('itemId ausente ao revogar item na Pluggy');

  try {
    await pluggySend('DELETE', `/items/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof PluggyApiError && err.status === 404) return;
    throw err;
  }
}
