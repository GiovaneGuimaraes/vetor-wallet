import type { Db } from '@vetor-wallet/db';
import type { SavingsEntry } from '@vetor-wallet/shared';

export interface ListSavingsEntriesParams {
  db: Db;
  userId: number;
}

/**
 * Os lançamentos de poupança de UM usuário, do mais recente para o mais antigo.
 *
 * **Sempre filtrada por `user_id`** — não existe leitura "todos os lançamentos".
 * O desempate por `created_at` mantém estável a ordem de dois lançamentos no
 * mesmo dia, que é o caso comum de aporte e rendimento lançados juntos.
 */
export async function listSavingsEntries(
  params: ListSavingsEntriesParams
): Promise<SavingsEntry[]> {
  const { db, userId } = params;
  const result = await db.execute({
    sql: 'SELECT * FROM savings_entries WHERE user_id = ? ORDER BY date DESC, created_at DESC',
    args: [userId],
  });
  return result.rows as unknown as SavingsEntry[];
}
