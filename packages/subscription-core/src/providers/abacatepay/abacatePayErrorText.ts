/**
 * Texto do `error` do envelope de um `AbacatePayError.body`, venha como string
 * ou como `{ message }`. Qualquer outra forma vira `''` — quem chama decide por
 * regex sobre o texto, e "sem texto" nunca casa.
 */
export const abacatePayErrorText = (body: unknown): string => {
  if (body == null || typeof body !== 'object') return '';
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (error != null && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
};
