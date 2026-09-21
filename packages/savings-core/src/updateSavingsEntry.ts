import type { Db } from '@vetor-wallet/db';
import type { SavingsEntry, SavingsEntryUpdate } from '@vetor-wallet/shared';

export interface UpdateSavingsEntryParams {
  db: Db;
  userId: number;
  id: string | number;
  changes: SavingsEntryUpdate;
}

/**
 * Edição parcial de um lançamento (T-031). Devolve a linha atualizada, ou
 * `null` quando o lançamento não é do usuário (ou não existe) — a rota traduz
 * esse `null` no 404.
 *
 * Campo a campo: só o que veio em `changes` entra no `SET`. Um `changes` vazio
 * é responsabilidade de quem chama (a rota recusa com 400 antes de chegar aqui);
 * aqui ele devolveria a linha intocada, que é o comportamento honesto para
 * "nenhuma mudança pedida".
 *
 * A checagem de existência e o `UPDATE` carregam os dois `user_id`: a primeira
 * decide o 404, e o segundo garante que nem uma corrida entre as duas consultas
 * poderia escrever em linha alheia.
 */
export async function updateSavingsEntry(
  params: UpdateSavingsEntryParams
): Promise<SavingsEntry | null> {
  const { db, userId, id, changes } = params;

  const existing = await db.execute({
    sql: 'SELECT id FROM savings_entries WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  if (existing.rows.length === 0) return null;

  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  if (changes.type !== undefined) {
    fields.push('type = ?');
    args.push(changes.type);
  }
  if (changes.amount !== undefined) {
    fields.push('amount = ?');
    args.push(changes.amount);
  }
  if (changes.date !== undefined) {
    fields.push('date = ?');
    args.push(changes.date);
  }
  if (changes.note !== undefined) {
    fields.push('note = ?');
    args.push(changes.note);
  }

  if (fields.length > 0) {
    args.push(id, userId);
    await db.execute({
      sql: `UPDATE savings_entries SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      args,
    });
  }

  const row = await db.execute({
    sql: 'SELECT * FROM savings_entries WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return row.rows[0] as unknown as SavingsEntry;
}
