import { PLUGGY_TIMEOUT_MS } from './PLUGGY_TIMEOUT_MS';
import { PluggyApiError } from './PluggyApiError';
import { resolvePluggyApiUrl } from './resolvePluggyApiUrl';

/**
 * `POST /auth` → `apiKey` de 2 horas, com cache em memória do processo (T-087).
 *
 * Confirmado na doc da Pluggy: o corpo é `{ clientId, clientSecret }`, a
 * resposta é `{ apiKey }` (um JWT) e "this API key expires after 2 hours".
 *
 * ## Cache e margem de segurança
 *
 * O job de sincronização faz N+1 requests (contas + páginas de transações) em
 * poucos segundos; pedir apiKey nova a cada uma seria gastar um POST de
 * autenticação por página sem ganho nenhum. O cache guarda a chave com validade
 * de 2h **menos 5 minutos** de margem: o vencimento real é contado pelo
 * servidor a partir da emissão, e uma chave que vence *durante* a request seria
 * um 401 no meio do lote.
 *
 * O `clientId` faz parte da entrada do cache. Trocar de credencial no meio do
 * processo (acontece em teste) precisa invalidar a chave anterior — caso
 * contrário o segundo cliente usaria o token do primeiro.
 *
 * ## Segredos
 *
 * `clientId`/`clientSecret` saem de `process.env` e **não** aparecem em nenhuma
 * mensagem de erro: a falha de autenticação reporta status HTTP, nunca o corpo
 * enviado. A `apiKey` também nunca é logada nem devolvida em erro.
 */
const API_KEY_TTL_MS = 2 * 60 * 60 * 1000;
const SAFETY_MARGIN_MS = 5 * 60 * 1000;

interface ApiKeyCacheEntry {
  apiKey: string;
  clientId: string;
  /** Timestamp (ms) a partir do qual a chave é considerada vencida. */
  expiresAt: number;
}

let cache: ApiKeyCacheEntry | null = null;

export async function getPluggyApiKey(): Promise<string> {
  const clientId = (process.env.PLUGGY_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.PLUGGY_CLIENT_SECRET ?? '').trim();

  if (!clientId || !clientSecret) {
    throw new PluggyApiError(
      'Credenciais da Pluggy ausentes: defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET'
    );
  }

  const now = Date.now();
  if (cache && cache.clientId === clientId && cache.expiresAt > now) {
    return cache.apiKey;
  }

  let res: Response;
  try {
    res = await fetch(`${resolvePluggyApiUrl()}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
      signal: AbortSignal.timeout(PLUGGY_TIMEOUT_MS),
    });
  } catch {
    // Sem `err` na mensagem de propósito: o erro de rede do fetch pode carregar
    // a request (com o corpo) no `cause`.
    throw new PluggyApiError('Falha de rede ao autenticar na Pluggy');
  }

  if (!res.ok) {
    throw new PluggyApiError(`Pluggy recusou a autenticação (HTTP ${res.status})`, res.status);
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new PluggyApiError('Resposta de /auth da Pluggy não é JSON');
  }

  const apiKey =
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { apiKey?: unknown }).apiKey === 'string'
      ? (payload as { apiKey: string }).apiKey.trim()
      : '';
  if (!apiKey) throw new PluggyApiError('Resposta de /auth da Pluggy sem apiKey');

  cache = { apiKey, clientId, expiresAt: now + API_KEY_TTL_MS - SAFETY_MARGIN_MS };
  return apiKey;
}

/** Limpa o cache da apiKey. Existe só para teste (precedente: `_resetCache` do brapi-core). */
export function _resetPluggyApiKeyCache(): void {
  cache = null;
}
