export const DEFAULT_PLUGGY_API_URL = 'https://api.pluggy.ai';

/**
 * Base da API da Pluggy, de `PLUGGY_API_URL` (opcional).
 *
 * Lido **dentro** da função, não no top-level do módulo — mesmo motivo do
 * `BRAPI_TOKEN` no `brapi-core`: permite trocar o env entre casos de teste.
 * A barra final é removida para que a concatenação com o path (`/auth`,
 * `/transactions`) nunca produza `//`.
 */
export function resolvePluggyApiUrl(): string {
  const raw = (process.env.PLUGGY_API_URL ?? '').trim();
  const base = raw || DEFAULT_PLUGGY_API_URL;
  return base.replace(/\/+$/, '');
}
