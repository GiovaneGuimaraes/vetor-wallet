import { db } from '../db';

/**
 * Recorrência mensal de despesa variável (T-035).
 *
 * Modelo: `recurring_expenses` é só o **template** (descrição, categoria
 * normalizada, valor, dia do mês, mês inicial, ativo). As ocorrências são
 * linhas normais de `expense_entries` com `recurring_id` preenchido — logo
 * continuam editáveis/excluíveis individualmente pela T-031 e entram nos
 * totais/orçamentos sem nenhum caso especial no resto do app.
 *
 * A materialização é **lazy**: nada é gerado no cadastro (além da ocorrência do
 * próprio mês em que a recorrência nasceu, criada junto do lançamento). Quando
 * um mês é consultado (`GET /api/expense-entries?month=` e
 * `GET /api/expense-entries/summary`), as ocorrências pendentes daquele mês são
 * geradas antes de a listagem/agregação rodar.
 *
 * Idempotência é **do banco**, não do código: `recurring_expense_months` tem
 * `UNIQUE(recurring_id, month)` e é ela que registra "este mês já foi gerado".
 * Duas consequências desejadas:
 *
 * 1. Dois GETs simultâneos do mesmo mês não duplicam — a reserva do mês e a
 *    ocorrência vão no mesmo batch transacional, e o perdedor da corrida tem o
 *    batch inteiro derrubado pela violação da chave única.
 * 2. **Excluir uma ocorrência não a recria**: a chave de controle vive numa
 *    tabela própria e sobrevive ao `DELETE` do `expense_entries`. Se o controle
 *    fosse um índice único sobre as próprias ocorrências, apagar a ocorrência
 *    liberaria a chave e o próximo GET a materializaria de novo.
 */

/** Dias do mês de um `YYYY-MM`. Retorna 0 para input malformado. */
export function daysInMonth(monthKey: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return 0;
  // Dia 0 do mês seguinte = último dia deste mês (UTC para não sofrer com fuso).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Data da ocorrência de uma recorrência num mês, com o dia **ajustado para
 * meses curtos**: dia 31 em fevereiro cai em 28 (ou 29 em ano bissexto), dia
 * 31 em abril cai em 30. Nunca transborda para o mês seguinte — a ocorrência
 * tem de pertencer ao mês consultado.
 */
export function occurrenceDate(monthKey: string, dayOfMonth: number): string {
  const total = daysInMonth(monthKey);
  const day = Math.min(Math.max(1, Math.trunc(dayOfMonth)), total || 31);
  return `${monthKey}-${String(day).padStart(2, '0')}`;
}

/**
 * `true` para o erro de violação do `UNIQUE(recurring_id, month)` — a corrida
 * de duas materializações do mesmo mês. Qualquer outro erro de banco tem de
 * continuar subindo (o handler global responde 500) em vez de virar um
 * "outro já gerou" silencioso.
 */
export function isUniqueViolation(err: unknown): boolean {
  // Só unicidade: `SQLITE_CONSTRAINT` genérico inclui FK/NOT NULL, que são bugs
  // e não corrida — engoli-los esconderia defeito real.
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return true;
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed/i.test(message);
}

export interface RecurringExpenseRow {
  id: number;
  description: string;
  category: string;
  amount: number;
  day_of_month: number;
  start_month: string;
}

/**
 * Registra o mês em que a recorrência nasceu como já materializado, apontando
 * para o lançamento que o usuário acabou de criar. Sem isso o primeiro GET do
 * mês de criação geraria uma segunda ocorrência idêntica.
 */
export async function markMonthMaterialized(recurringId: number, month: string): Promise<void> {
  await db.execute({
    sql: 'INSERT OR IGNORE INTO recurring_expense_months (recurring_id, month) VALUES (?, ?)',
    args: [recurringId, month],
  });
}

/**
 * Gera as ocorrências pendentes de `months` para todas as recorrências ATIVAS
 * do usuário. Idempotente e seguro sob concorrência (ver doc do módulo).
 *
 * Regras:
 * - meses anteriores a `start_month` são ignorados (recorrência não retroage).
 *   `start_month` é o mês de CRIAÇÃO da recorrência — ou o mês do lançamento,
 *   quando este é futuro. Ver o POST em `routes/expenseEntries.ts`: um cadastro
 *   com data passada não pode reescrever meses já fechados;
 * - meses futuros **são** materializados: navegar para frente em `/despesas`
 *   deve mostrar a assinatura que já se sabe que vai cair lá;
 * - recorrência encerrada (`active = 0`) não gera mais nada — nem em meses
 *   passados que nunca foram consultados. As já materializadas ficam.
 *
 * Devolve quantas ocorrências foram efetivamente inseridas (usado em teste).
 */
export async function materializeRecurringExpenses(
  userId: number,
  months: string[],
): Promise<number> {
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
    generated.rows.map((row) => `${Number(row.recurring_id)} ${String(row.month)}`),
  );

  let created = 0;
  for (const recurrence of recurrences) {
    for (const month of targetMonths) {
      if (month < recurrence.start_month) continue;
      if (alreadyGenerated.has(`${recurrence.id} ${month}`)) continue;

      // Reserva do mês + ocorrência no MESMO batch (transacional no libsql):
      // se as duas escritas fossem independentes, uma falha entre elas deixaria
      // o mês marcado como gerado para sempre, sem ocorrência e sem caminho de
      // reparo — indistinguível de uma ocorrência excluída pelo usuário.
      //
      // O `INSERT` da reserva é intencionalmente SEM `OR IGNORE`: é a violação
      // do `UNIQUE(recurring_id, month)` que sinaliza "outra request chegou
      // primeiro", derruba o batch inteiro e faz o perdedor da corrida não
      // inserir nada. (O perdedor pode responder aquele mês sem a ocorrência
      // que o vencedor acabou de gravar; o GET seguinte já a mostra.)
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
          'write',
        );
        created += 1;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
  }

  return created;
}
