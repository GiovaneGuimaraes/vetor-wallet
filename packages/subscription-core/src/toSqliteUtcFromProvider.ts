import { parseInstant } from './parseInstant';
import { toSqliteUtc } from './toSqliteUtc';

/**
 * Converte um instante vindo do provedor (ISO 8601 com `T`/`Z`) para o formato
 * do banco. Gravar o ISO cru quebraria a comparação `expires_at > ?` — ver
 * `toSqliteUtc`. Entrada inválida vira `null` ("sem expiração conhecida"),
 * nunca `'Invalid Date'`.
 */
export const toSqliteUtcFromProvider = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const parsed = parseInstant(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toSqliteUtc(parsed);
};
