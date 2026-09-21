import type { TransactionalDb } from './TransactionalDb';

/** Parâmetros para `createRecurringExpenseEntry` — ver doc da função. */
export interface CreateRecurringEntryParams {
  db: TransactionalDb;
  userId: number;
  description: string;
  category: string;
  amount: number;
  date: string;
  dayOfMonth: number;
  startMonth: string;
  entryMonth: string;
}

export interface CreateRecurringEntryResult {
  entryId: number;
  recurringId: number;
}

/**
 * Cria o template de recorrência (`recurring_expenses`), reserva o mês do
 * lançamento no livro-razão (`recurring_expense_months`) e insere a primeira
 * ocorrência (`expense_entries`) — as três escritas do caminho
 * `POST /api/expense-entries` com `recurring: true` (T-045).
 *
 * Antes da T-045 essas três escritas eram independentes: uma falha entre elas
 * podia deixar o template órfão (sem a ocorrência que deveria acompanhá-lo) ou
 * o mês reservado sem nenhum lançamento correspondente — indistinguível de uma
 * ocorrência excluída de propósito (ver doc de `materializeRecurringExpenses`).
 *
 * Usa transação interativa, e não `batch`, porque a segunda e a terceira
 * escrita dependem do `lastInsertRowid` da primeira (`recurring_id` a
 * vincular). `close()` no `finally` cobre os dois casos: se `commit()` já
 * rodou, não faz nada; se uma escrita lançou antes do commit, reverte a
 * transação inteira — não há caminho em que o template fique sem a ocorrência
 * ou o mês fique marcado sem lançamento.
 *
 * Reserva do mês com `OR IGNORE` (assimetria proposital em relação ao `INSERT`
 * sem `OR IGNORE` de `materializeRecurringExpenses`): aqui é seguro, porque
 * `recurringId` acabou de nascer NESTA transação — nenhuma outra request pode
 * tê-lo reservado ainda (o id só existe fora daqui depois do `commit`). Não há
 * corrida a detectar. No GET, ao contrário, a recorrência já existe e é
 * compartilhada entre requests concorrentes, então a violação do
 * `UNIQUE(recurring_id, month)` É o sinal de corrida.
 *
 * Custo aceito da transação interativa (primeiro uso no repo — não copie o
 * padrão sem considerar isto): no driver local (`@libsql/client` sobre
 * arquivo), `transaction()` toma posse da conexão corrente e a abandona — o
 * client cria uma nova conexão lazy na próxima chamada, e `close()` não fecha
 * esse handle abandonado. Aceitável aqui porque criar uma recorrência é um
 * evento raro (não um hot path) num app single-user.
 */
export async function createRecurringExpenseEntry(
  params: CreateRecurringEntryParams
): Promise<CreateRecurringEntryResult> {
  const tx = await params.db.transaction('write');
  try {
    const createdRecurrence = await tx.execute({
      sql: `INSERT INTO recurring_expenses
              (user_id, description, category, amount, day_of_month, start_month)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        params.userId,
        params.description,
        params.category,
        params.amount,
        params.dayOfMonth,
        params.startMonth,
      ],
    });
    const recurringId = Number(createdRecurrence.lastInsertRowid ?? 0);
    if (!recurringId) {
      // Sem id não há como vincular a ocorrência: gravar `recurring_id = 0`
      // deixaria o lançamento apontando para um template inexistente.
      throw new Error('T-035: falha ao criar a recorrência (lastInsertRowid ausente)');
    }

    // Marca o mês do LANÇAMENTO, não `startMonth` — num cadastro retroativo os
    // dois divergem, e marcar o mês corrente suprimiria a ocorrência que a
    // recorrência deve gerar agora.
    await tx.execute({
      sql: 'INSERT OR IGNORE INTO recurring_expense_months (recurring_id, month) VALUES (?, ?)',
      args: [recurringId, params.entryMonth],
    });

    const insert = await tx.execute({
      sql: `INSERT INTO expense_entries (user_id, description, category, amount, date, recurring_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        params.userId,
        params.description,
        params.category,
        params.amount,
        params.date,
        recurringId,
      ],
    });

    await tx.commit();
    return { entryId: Number(insert.lastInsertRowid ?? 0), recurringId };
  } finally {
    tx.close();
  }
}
