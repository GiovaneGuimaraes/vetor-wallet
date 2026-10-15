import type { Db } from '@vetor-wallet/db';
import type { ExpenseMonthSummaryItem } from '@vetor-wallet/shared';

export interface SummarizeExpenseEntriesParams {
  db: Db;
  userId: number;
  /** `YYYY-MM` inclusivo — a rota deriva da janela pedida (`months`/`endMonth`). */
  startMonth: string;
  /** `YYYY-MM` inclusivo. */
  endMonth: string;
}

/**
 * Total de lançamentos variáveis por mês, numa janela fechada (T-033/T-049).
 *
 * **Meses sem nenhum lançamento ficam ausentes** do retorno — decisão de
 * projeto para manter a query simples (não precisa gerar uma série completa no
 * SQL). Quem preenche os N meses pedidos com `0` é a função pura
 * `buildMonthlyHistory` em `packages/web/src/routes/expenseMonth.ts`.
 *
 * A janela **não** tem teto de horizonte: meses futuros além de
 * `MATERIALIZATION_HORIZON_MONTHS` continuam sendo agregados, apenas não geram
 * ocorrência nova. O teto é da materialização (na rota), não da leitura.
 */
export async function summarizeExpenseEntries(
  params: SummarizeExpenseEntriesParams
): Promise<ExpenseMonthSummaryItem[]> {
  const { db, userId, startMonth, endMonth } = params;
  const result = await db.execute({
    sql: `SELECT substr(date, 1, 7) as month, SUM(amount) as total FROM expense_entries
            WHERE user_id = ? AND substr(date, 1, 7) BETWEEN ? AND ?
            GROUP BY month
            ORDER BY month ASC`,
    args: [userId, startMonth, endMonth],
  });
  return result.rows.map((row) => ({
    month: String(row.month),
    total: Number(row.total),
  }));
}
