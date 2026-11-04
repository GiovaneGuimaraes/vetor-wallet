import { MAX_EXTERNAL_ID_LENGTH } from './MAX_EXTERNAL_ID_LENGTH';

export type ExternalIdValidation =
  { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Valida o `externalId` opcional do corpo de um POST (T-084).
 *
 * - `undefined`/`null` → ausente (grava `NULL`): serializadores emitem `null`
 *   para campo opcional vazio, então os dois casos são o mesmo.
 * - `trim()` antes de tudo; o valor trimado é o gravado e o comparado, senão
 *   `' FIT-1 '` e `'FIT-1'` seriam chaves diferentes e o dedupe falharia.
 * - Vazio após trim → **400**, não "ausente": string vazia vinda de importador é
 *   bug, e engoli-la desligaria o dedupe silenciosamente para aquela linha.
 * - Sem restrição de charset e sem normalização de caixa — ids de origem são
 *   opacos e podem ser case-sensitive.
 */
export function validateExternalId(raw: unknown): ExternalIdValidation {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'externalId deve ser texto' };
  const value = raw.trim();
  if (!value) return { ok: false, error: 'externalId não pode ser vazio' };
  if (value.length > MAX_EXTERNAL_ID_LENGTH) {
    return {
      ok: false,
      error: `externalId deve ter no máximo ${MAX_EXTERNAL_ID_LENGTH} caracteres`,
    };
  }
  return { ok: true, value };
}
