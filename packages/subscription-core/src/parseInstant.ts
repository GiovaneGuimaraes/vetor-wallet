/**
 * Aceita tanto `'YYYY-MM-DD HH:MM:SS'` (o que sai do SQLite) quanto ISO 8601
 * com `T`/`Z`. Sem timezone explícito o instante é tratado como **UTC**, que é
 * o que `datetime('now')` grava — interpretar como hora local deslocaria o fim
 * do período em até um dia dependendo de onde o server roda.
 */
export const parseInstant = (value: string): Date => {
  const trimmed = value.trim();
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  return new Date(withZone);
};
