import type { Db } from '@vetor-wallet/db';
import type { IncomeEntry } from '@vetor-wallet/shared';

export interface ListIncomeEntriesByMonthParams {
  db: Db;
  userId: number;
  /** `YYYY-MM` — a rota valida o formato antes de chegar aqui. */
  month: string;
}

/**
 * Os lançamentos avulsos de renda (T-036) de um mês, do mais recente para o
 * mais antigo.
 *
 * O recorte do mês é `substr(date, 1, 7)`, e não um BETWEEN de datas: `date` é
 * texto `YYYY-MM-DD` no SQLite, então o prefixo é comparação exata e dispensa
 * calcular o último dia do mês.
 *
 * **Nota para o passo 5 da migração** (Postgres): com coluna de data real, isto
 * vira um filtro de intervalo — `substr` sobre `date` deixa de fazer sentido e
 * impediria o índice de ser usado.
 */
export async function listIncomeEntriesByMonth(
  params: ListIncomeEntriesByMonthParams
): Promise<IncomeEntry[]> {
  const { db, userId, month } = params;
  const result = await db.execute({
    sql: `SELECT * FROM income_entries
          WHERE user_id = ? AND substr(date, 1, 7) = ?
          ORDER BY date DESC, created_at DESC`,
    args: [userId, month],
  });
  return result.rows as unknown as IncomeEntry[];
}
