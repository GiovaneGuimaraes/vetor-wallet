import { getPluggyApiKey } from './getPluggyApiKey';
import { PLUGGY_TIMEOUT_MS } from './PLUGGY_TIMEOUT_MS';
import { PluggyApiError } from './PluggyApiError';
import { resolvePluggyApiUrl } from './resolvePluggyApiUrl';

/**
 * Request autenticado que **muda estado** na Pluggy — `POST`/`DELETE` (T-089b).
 *
 * Irmão do `pluggyGet`, separado dele de propósito: leitura é idempotente e
 * pode ser repetida à vontade, escrita não. Ter os dois no mesmo arquivo
 * convidaria um retry automático de leitura a escorregar para cima de um
 * `POST /items`, que criaria uma segunda conexão bancária.
 *
 * Como no `pluggyGet`: autenticação por `X-API-KEY`, nada degrada em silêncio
 * (rede, timeout, status não-ok e JSON inválido viram `PluggyApiError`) e nem a
 * `apiKey` nem o corpo enviado entram em mensagem de erro — o corpo do
 * `connect_token` carrega identificadores do usuário.
 *
 * `204 No Content` devolve `null`: é a resposta normal do `DELETE /items/{id}`,
 * e tentar `res.json()` num corpo vazio explodiria.
 */
export async function pluggySend(
  method: 'POST' | 'DELETE',
  pathWithQuery: string,
  body?: unknown
): Promise<unknown> {
  const apiKey = await getPluggyApiKey();
  const url = `${resolvePluggyApiUrl()}${pathWithQuery}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'X-API-KEY': apiKey,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(PLUGGY_TIMEOUT_MS),
    });
  } catch {
    throw new PluggyApiError(`Falha de rede ao chamar a Pluggy (${method} ${pathWithQuery})`);
  }

  if (!res.ok) {
    throw new PluggyApiError(
      `Pluggy respondeu HTTP ${res.status} em ${method} ${pathWithQuery}`,
      res.status
    );
  }

  if (res.status === 204) return null;

  try {
    return await res.json();
  } catch {
    throw new PluggyApiError(`Resposta da Pluggy não é JSON (${method} ${pathWithQuery})`);
  }
}
