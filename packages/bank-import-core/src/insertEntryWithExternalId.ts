import type { Query } from '@vetor-wallet/query';
import type { EntryTable } from './EntryTable';

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
export interface InsertEntryParams {
  query: Query;
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
  | { status: 'created'; row: Record<string, unknown> | undefined }
  | { status: 'duplicate'; row: Record<string, unknown> | undefined };

const COLUMN_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Insere um lançamento e trata a colisão de `external_id` como **duplicata**, não
 * como erro.
 *
 * Estratégia (T-116c): um único `INSERT … ON CONFLICT (user_id, external_id)
 * WHERE external_id IS NOT NULL DO NOTHING RETURNING id`. Sem linha devolvida =
 * a chave já existia = duplicata. **Não depende de capturar exceção**: o
 * `isUniqueViolation` de cada banco (`SQLITE_CONSTRAINT_UNIQUE` × `23505`) é a
 * armadilha silenciosa do passo 5 — se deixasse de reconhecer o erro, a
 * duplicata viraria 500 sem quebrar build nem tipo. A cláusula roda igual em
 * SQLite (≥ 3.35) e Postgres, e a idempotência continua sendo do banco. Um
 * SELECT-antes-do-INSERT seria TOCTOU. Custo: o caminho feliz não paga nada
 * extra; só a duplicata paga o SELECT de recuperação.
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
  const { query, table, userId, values, externalId } = params;

  const columns = Object.keys(values);
  for (const column of columns) {
    if (!COLUMN_RE.test(column)) throw new Error(`Coluna inválida: ${column}`);
  }

  const allColumns = ['user_id', ...columns, 'external_id'];
  const args = [userId, ...columns.map((c) => values[c]), externalId];

  const insert = await query<{ id: number }>({
    text: `INSERT INTO ${table} (${allColumns.join(', ')})
           VALUES (${allColumns.map((_, i) => `$${i + 1}`).join(', ')})
           ON CONFLICT (user_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
           RETURNING id`,
    values: args,
  });

  if (insert.rows.length > 0) {
    // Re-SELECT filtrado por user_id, como no resto das rotas (T-059).
    const created = await query({
      text: `SELECT * FROM ${table} WHERE id = $1 AND user_id = $2`,
      values: [Number(insert.rows[0].id ?? 0), userId],
    });
    return { status: 'created', row: created.rows[0] };
  }

  // Sem linha devolvida só acontece em conflito de `external_id` (a cláusula é
  // parcial: com `external_id` NULL nunca conflita).
  if (externalId === null) throw new Error('INSERT não devolveu a linha criada');
  const existing = await query({
    text: `SELECT * FROM ${table} WHERE user_id = $1 AND external_id = $2`,
    values: [userId, externalId],
  });
  return { status: 'duplicate', row: existing.rows[0] };
}
