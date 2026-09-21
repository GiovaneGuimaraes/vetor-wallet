import type { Db } from '@vetor-wallet/db';
import { isUniqueViolation } from '@vetor-wallet/db';
import { occurrenceDate } from './occurrenceDate';
import type { RecurringExpenseRow } from './RecurringExpenseRow';

export interface MaterializeRecurringExpensesParams {
  db: Db;
  userId: number;
  months: string[];
}

/**
 * Gera as ocorrências pendentes de `months` para todas as recorrências ATIVAS
 * do usuário. Idempotente e seguro sob concorrência.
 *
 * A materialização é **lazy**: nada é gerado no cadastro (além da ocorrência do
 * mês em que a recorrência nasceu). Quando um mês é consultado, as ocorrências
 * pendentes dele são geradas antes de a listagem/agregação rodar.
 *
 * Idempotência é **do banco**, não do código: `recurring_expense_months` tem
 * `UNIQUE(recurring_id, month)` e é ela que registra "este mês já foi gerado".
 * Duas consequências desejadas: dois GETs simultâneos do mesmo mês não
 * duplicam, e **excluir uma ocorrência não a recria** — a chave de controle
 * vive numa tabela própria e sobrevive ao `DELETE` de `expense_entries`.
 *
 * Regras:
 * - meses anteriores a `start_month` são ignorados (recorrência não retroage);
 * - meses futuros **são** materializados: navegar para frente em `/despesas`
 *   deve mostrar a assinatura que já se sabe que vai cair lá;
 * - recorrência encerrada (`active = 0`) não gera mais nada. As já
 *   materializadas ficam.
 *
 * Devolve quantas ocorrências foram efetivamente inseridas.
 */
export async function materializeRecurringExpenses(
  params: MaterializeRecurringExpensesParams
): Promise<number> {
  const { db, userId, months } = params;

  const targetMonths = months.filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m));
  if (targetMonths.length === 0) return 0;

  const active = await db.execute({
    sql: `SELECT id, description, category, amount, day_of_month, start_month
          FROM recurring_expenses
          WHERE user_id = ? AND active = 1`,
    args: [userId],
  });
  if (active.rows.length === 0) return 0;

  const recurrences: RecurringExpenseRow[] = active.rows.map((row) => ({
    id: Number(row.id),
    description: String(row.description),
    category: String(row.category ?? ''),
    amount: Number(row.amount),
    day_of_month: Number(row.day_of_month),
    start_month: String(row.start_month),
  }));

  // Uma query para saber o que já existe, em vez de uma por (recorrência, mês).
  const generated = await db.execute({
    sql: `SELECT m.recurring_id AS recurring_id, m.month AS month
          FROM recurring_expense_months m
          JOIN recurring_expenses r ON r.id = m.recurring_id
          WHERE r.user_id = ?`,
    args: [userId],
  });
  const alreadyGenerated = new Set(
    generated.rows.map((row) => `${Number(row.recurring_id)} ${String(row.month)}`)
  );

  let created = 0;
  for (const recurrence of recurrences) {
    for (const month of targetMonths) {
      if (month < recurrence.start_month) continue;
      if (alreadyGenerated.has(`${recurrence.id} ${month}`)) continue;

      // Reserva do mês + ocorrência no MESMO batch (transacional no libsql): se
      // as duas escritas fossem independentes, uma falha entre elas deixaria o
      // mês marcado como gerado para sempre, sem ocorrência e sem caminho de
      // reparo — indistinguível de uma ocorrência excluída pelo usuário.
      //
      // O `INSERT` da reserva é intencionalmente SEM `OR IGNORE`: é a violação
      // do `UNIQUE(recurring_id, month)` que sinaliza "outra request chegou
      // primeiro", derruba o batch inteiro e faz o perdedor da corrida não
      // inserir nada.
      try {
        await db.batch(
          [
            {
              sql: 'INSERT INTO recurring_expense_months (recurring_id, month) VALUES (?, ?)',
              args: [recurrence.id, month],
            },
            {
              sql: `INSERT INTO expense_entries
                      (user_id, description, category, amount, date, recurring_id)
                    VALUES (?, ?, ?, ?, ?, ?)`,
              args: [
                userId,
                recurrence.description,
                recurrence.category,
                recurrence.amount,
                occurrenceDate(month, recurrence.day_of_month),
                recurrence.id,
              ],
            },
          ],
          'write'
        );
        created += 1;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
  }

  return created;
}
