import type { Query } from '@vetor-wallet/query';
import type { SavingsEntry, SavingsEntryUpdate } from '@vetor-wallet/shared';

export interface UpdateSavingsEntryParams {
  query: Query;
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
 *
 * Placeholders `$1, $2, ...` (T-113, passo 5) — o índice do `SET` é montado em
 * ordem porque o número de campos enviados varia por chamada.
 */
export async function updateSavingsEntry(
  params: UpdateSavingsEntryParams
): Promise<SavingsEntry | null> {
  const { query, userId, id, changes } = params;

  const existing = await query({
    text: 'SELECT id FROM savings_entries WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  if (existing.rows.length === 0) return null;

  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  let paramIndex = 1;
  if (changes.type !== undefined) {
    fields.push(`type = $${paramIndex++}`);
    values.push(changes.type);
  }
  if (changes.amount !== undefined) {
    fields.push(`amount = $${paramIndex++}`);
    values.push(changes.amount);
  }
  if (changes.date !== undefined) {
    fields.push(`date = $${paramIndex++}`);
    values.push(changes.date);
  }
  if (changes.note !== undefined) {
    fields.push(`note = $${paramIndex++}`);
    values.push(changes.note);
  }

  if (fields.length > 0) {
    values.push(id as string | number, userId);
    await query({
      text: `UPDATE savings_entries SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}`,
      values,
    });
  }

  const row = await query<SavingsEntry>({
    text: 'SELECT * FROM savings_entries WHERE id = $1 AND user_id = $2',
    values: [id, userId],
  });
  return row.rows[0];
}
