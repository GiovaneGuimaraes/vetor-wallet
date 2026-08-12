import { getPluggyApiKey } from './getPluggyApiKey';
import { PLUGGY_TIMEOUT_MS } from './PLUGGY_TIMEOUT_MS';
import { PluggyApiError } from './PluggyApiError';
import { resolvePluggyApiUrl } from './resolvePluggyApiUrl';

/**
 * GET autenticado na Pluggy (T-087).
 *
 * Recebe o path **com a querystring já montada** (`/accounts?itemId=...`), e não
 * um objeto de parâmetros, porque a paginação da v2 devolve o próximo passo como
 * querystring pronta (`next: "?accountId=...&after=..."`): tratar tudo como
 * string faz o "seguir o cursor" ser concatenação em vez de desmontar e remontar
 * parâmetros que a Pluggy já montou.
 *
 * Autenticação é o header `X-API-KEY` com a apiKey de 2h (`getPluggyApiKey`).
 * Nunca degrada em silêncio: rede, timeout, status não-ok e JSON inválido viram
 * `PluggyApiError`. A `apiKey` não entra em nenhuma mensagem.
 */
export async function pluggyGet(pathWithQuery: string): Promise<unknown> {
  const apiKey = await getPluggyApiKey();
  const url = `${resolvePluggyApiUrl()}${pathWithQuery}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(PLUGGY_TIMEOUT_MS),
    });
  } catch {
    throw new PluggyApiError(`Falha de rede ao chamar a Pluggy (${pathWithQuery})`);
  }

  if (!res.ok) {
    throw new PluggyApiError(`Pluggy respondeu HTTP ${res.status} em ${pathWithQuery}`, res.status);
  }

  try {
    return await res.json();
  } catch {
    throw new PluggyApiError(`Resposta da Pluggy não é JSON (${pathWithQuery})`);
  }
}
