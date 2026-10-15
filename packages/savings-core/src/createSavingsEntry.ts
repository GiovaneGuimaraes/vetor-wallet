import type { Query } from '@vetor-wallet/query';
import type { SavingsEntry, SavingsEntryType } from '@vetor-wallet/shared';

export interface CreateSavingsEntryParams {
  query: Query;
  userId: number;
  type: SavingsEntryType;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  note?: string;
}

/**
 * Grava um lançamento e devolve a linha criada.
 *
 * O re-SELECT é filtrado por `user_id` (T-059, simetria com o update — T-051):
 * ler de volta só pelo `id` recém-criado funcionaria, mas abriria um caminho de
 * leitura sem dono, e a regra do app é que **toda** consulta de dado carregue o
 * usuário na cláusula.
 *
 * `RETURNING id` no lugar do `lastInsertRowid` do SQLite (T-113, passo 5 de
 * `docs/multi-agent/plano-migracao-aws.md`) — o mesmo formato nos dois backends
 * do `@vetor-wallet/query`.
 *
 * A coluna `goal_id` foi removida do banco na T-091b2 — não há mais nem onde
 * gravar o vínculo com meta.
 */
export async function createSavingsEntry(params: CreateSavingsEntryParams): Promise<SavingsEntry> {
  const { query, userId, type, amount, date, note = '' } = params;

  const insert = await query<{ id: number }>({
    text: 'INSERT INTO savings_entries (user_id, type, amount, date, note) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    values: [userId, type, amount, date, note ?? ''],
  });

  const newId = insert.rows[0]?.id ?? 0;
  const row = await query<SavingsEntry>({
    text: 'SELECT * FROM savings_entries WHERE id = $1 AND user_id = $2',
    values: [newId, userId],
  });
  return row.rows[0];
}
