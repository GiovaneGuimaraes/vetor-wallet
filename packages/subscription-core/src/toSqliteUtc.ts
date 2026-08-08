const pad = (n: number): string => {
  return String(n).padStart(2, '0');
};

/**
 * Formata um `Date` no formato de instante do SQLite (`'YYYY-MM-DD HH:MM:SS'`),
 * em UTC.
 *
 * **Todo instante gravado no banco por este package sai daqui** — nunca
 * `toISOString()` cru. O banco compara `current_period_end`/`expires_at` com
 * `datetime('now')`, que produz exatamente esse formato; gravar
 * `2026-08-01T12:00:00.000Z` faria a comparação lexicográfica mentir (o `T` é
 * maior que qualquer dígito, então TUDO pareceria futuro).
 */
export const toSqliteUtc = (date: Date): string => {
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
};
