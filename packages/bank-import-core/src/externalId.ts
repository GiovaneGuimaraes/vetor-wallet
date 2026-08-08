import type { Row } from '@libsql/client';
import { db, isUniqueViolation } from '@vetor-wallet/db';

/**
 * Dedupe de importação de lançamentos (T-084).
 *
 * `income_entries.external_id` / `expense_entries.external_id` guardam o
 * identificador da transação no sistema de ORIGEM (FITID do OFX, id da
 * transação Pluggy). `NULL` = lançamento digitado à mão pela UI. Um índice único
 * PARCIAL `(user_id, external_id) WHERE external_id IS NOT NULL` é o que garante
 * que reimportar o mesmo arquivo/período não duplique nada — a idempotência é
 * **do banco**, não do código (mesma decisão da T-035).
 *
 * Convenção de valor (adotada pelos importadores, NÃO validada aqui):
 * prefixe a origem — `ofx:<FITID>`, `pluggy:<id>` — para que a mesma transação
 * vista por dois canais não colida por acidente de formato de id.
 *
 * Assimetria intencional com a T-035: **DELETE libera a chave**, então
 * reimportar o extrato recria um lançamento apagado. Isso é desejado (desfazer
 * uma exclusão acidental reimportando), ao contrário da recorrência, onde o
 * controle vive em tabela própria justamente para NÃO recriar.
 */

/** Tabelas com dedupe por `external_id`. União literal — nunca string de input. */
export type EntryTable = 'income_entries' | 'expense_entries';

/** Limite de tamanho: FITID pela spec OFX tem no máx. 255; ids Pluggy são UUIDs. */
export const MAX_EXTERNAL_ID_LENGTH = 255;

export type ExternalIdValidation =
  { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Valida o `externalId` opcional do corpo de um POST.
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

export interface InsertEntryParams {
  table: EntryTable;
  userId: number;
  /**
   * Colunas do INSERT além de `user_id`/`external_id`. As chaves são literais do
   * código chamador (nunca vêm do corpo da request) e ainda assim passam por um
   * guard de formato antes de entrar no SQL.
   */
  values: Record<string, string | number | null>;
  /** Já validado por `validateExternalId`; `null` = lançamento manual. */
  externalId: string | null;
}

export type InsertEntryResult =
  { status: 'created'; row: Row | undefined } | { status: 'duplicate'; row: Row | undefined };

const COLUMN_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Insere um lançamento e trata a colisão de `external_id` como **duplicata**, não
 * como erro.
 *
 * Estratégia: INSERT primeiro, captura da violação de unicidade. Um
 * SELECT-antes-do-INSERT seria TOCTOU — duas requests em paralelo passariam as
 * duas pela checagem e a segunda estouraria o UNIQUE como 500. Custo: o caminho
 * feliz não paga nada extra; só a duplicata paga o SELECT de recuperação.
 *
 * É esta função (não a rota HTTP) o contrato dos importadores — o job de
 * sincronização roda no `cli` e chama daqui, sem passar por Express nem pelo
 * gate de assinatura.
 *
 * Borda: se a linha existente desaparecer entre o INSERT e o SELECT de
 * recuperação (DELETE concorrente), `row` vem `undefined` e o chamador responde
 * a duplicata sem corpo do registro. Sem retry — a próxima importação recria.
 */
export async function insertEntryWithExternalId(
  params: InsertEntryParams
): Promise<InsertEntryResult> {
  const { table, userId, values, externalId } = params;

  const columns = Object.keys(values);
  for (const column of columns) {
    if (!COLUMN_RE.test(column)) throw new Error(`Coluna inválida: ${column}`);
  }

  const allColumns = ['user_id', ...columns, 'external_id'];
  const args = [userId, ...columns.map((c) => values[c]), externalId];

  try {
    const insert = await db.execute({
      sql: `INSERT INTO ${table} (${allColumns.join(', ')})
            VALUES (${allColumns.map(() => '?').join(', ')})`,
      args,
    });
    // Re-SELECT filtrado por user_id, como no resto das rotas (T-059).
    const created = await db.execute({
      sql: `SELECT * FROM ${table} WHERE id = ? AND user_id = ?`,
      args: [Number(insert.lastInsertRowid ?? 0), userId],
    });
    return { status: 'created', row: created.rows[0] };
  } catch (err) {
    // Qualquer outro erro de banco sobe (500) — só unicidade é duplicata.
    if (!isUniqueViolation(err) || externalId === null) throw err;
    const existing = await db.execute({
      sql: `SELECT * FROM ${table} WHERE user_id = ? AND external_id = ?`,
      args: [userId, externalId],
    });
    return { status: 'duplicate', row: existing.rows[0] };
  }
}

/** Corpo padrão da resposta 409 de duplicata de importação (POST unitário). */
export function duplicateEntryResponse(row: Row | undefined) {
  return {
    error: 'Lançamento já importado (externalId duplicado)',
    duplicate: true,
    entry: row ?? null,
  };
}
