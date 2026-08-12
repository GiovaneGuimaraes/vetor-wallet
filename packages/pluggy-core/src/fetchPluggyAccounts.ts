import { pluggyGet } from './pluggyGet';
import { PluggyApiError } from './PluggyApiError';
import { toPluggyAccount, type PluggyAccount } from './toPluggyAccount';

/**
 * `GET /accounts?itemId=<itemId>` → contas do item (T-087).
 *
 * O `itemId` vem do env (`PLUGGY_ITEM_ID`) porque **não existe endpoint de
 * listar items** na API da Pluggy: só `POST /items`, `GET /items/{id}`, `PUT` e
 * `DELETE`. O item nasce da ligação OAuth com a instituição e seu id é dado
 * de configuração, não algo descobrível.
 *
 * Por isso o 404/403 daqui é traduzido em mensagem **acionável**: "item não
 * encontrado" é o erro mais provável desta integração (id de outra aplicação,
 * ligação OAuth nunca feita, item apagado) e a pior falha possível seria o job
 * anunciar "0 contas" com sucesso.
 */
export async function fetchPluggyAccounts(itemId: string): Promise<PluggyAccount[]> {
  const id = itemId.trim();
  if (!id) {
    throw new PluggyApiError('itemId ausente: defina PLUGGY_ITEM_ID no .env do cli');
  }

  const query = new URLSearchParams({ itemId: id }).toString();

  let payload: unknown;
  try {
    payload = await pluggyGet(`/accounts?${query}`);
  } catch (err) {
    if (err instanceof PluggyApiError && (err.status === 404 || err.status === 403)) {
      throw new PluggyApiError(
        `Pluggy não encontrou o item "${id}" (HTTP ${err.status}). Confira PLUGGY_ITEM_ID: ` +
          'o id tem de pertencer à MESMA aplicação de PLUGGY_CLIENT_ID e o item só existe ' +
          'depois da ligação (OAuth) com a instituição financeira no Meu Pluggy.',
        err.status
      );
    }
    throw err;
  }

  const results = (payload as { results?: unknown })?.results;
  if (!Array.isArray(results)) {
    throw new PluggyApiError('Resposta de /accounts da Pluggy sem a lista `results`');
  }

  return results.map(toPluggyAccount);
}
