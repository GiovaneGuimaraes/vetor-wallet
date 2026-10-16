import type { Db } from '@vetor-wallet/db';
import type { ExpenseEntry } from '@vetor-wallet/shared';

export interface ListExpenseEntriesByMonthParams {
  db: Db;
  userId: number;
  /** `YYYY-MM` — a rota valida o formato antes de chegar aqui. */
  month: string;
}

/**
 * Os lançamentos de despesa variável de um mês, do mais recente para o mais
 * antigo.
 *
 * **Não materializa recorrência.** Quem chama é que decide se o mês pedido
 * cabe no horizonte de materialização (`MATERIALIZATION_HORIZON_MONTHS`, na
 * rota) e roda `materializeRecurringExpenses` antes — esta função é leitura
 * pura, e juntar as duas esconderia uma escrita dentro de um `list*`.
 *
 * O recorte do mês é `substr(date, 1, 7)`, e não um BETWEEN de datas: `date` é
 * texto `YYYY-MM-DD` no SQLite, então o prefixo é comparação exata e dispensa
 * calcular o último dia do mês.
 *
 * **Nota para o passo 5 da migração** (Postgres): com coluna de data real isto
 * vira um filtro de intervalo — `substr` sobre `date` deixa de fazer sentido e
 * impediria o índice `idx_expense_entries_user_date` de ser usado.
 */
export async function listExpenseEntriesByMonth(
  params: ListExpenseEntriesByMonthParams
): Promise<ExpenseEntry[]> {
  const { db, userId, month } = params;
  const result = await db.execute({
    sql: `SELECT * FROM expense_entries
          WHERE user_id = ? AND substr(date, 1, 7) = ?
          ORDER BY date DESC, created_at DESC`,
    args: [userId, month],
  });
  return result.rows as unknown as ExpenseEntry[];
}
