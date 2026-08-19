import type { Db } from '@vetor-wallet/db';

/**
 * Limpeza total dos lançamentos de um usuário, antes de reimportar (T-089b).
 *
 * É o modo **replace** da importação da Pluggy — decisão do humano (2026-08-12),
 * tomada depois de o risco ter sido apresentado e as alternativas mais estreitas
 * (replace só das linhas `pluggy:*`, replace da janela sincronizada) terem sido
 * recusadas explicitamente.
 *
 * ## O que isto apaga, e o que NÃO repõe
 *
 * Apaga **todas** as linhas de `income_entries`, `expense_entries` e
 * `savings_entries` do usuário — manuais, de OFX e da Pluggy, de qualquer data.
 * Em seguida a importação grava de volta apenas o que a Pluggy devolve, que é
 * uma janela (default 30 dias) e só das contas conectadas.
 *
 * A consequência que a UI é obrigada a dizer antes de confirmar, porque não é
 * dedutível do nome "replace": **a poupança não volta.** A importação da Pluggy
 * escreve em `income_entries`/`expense_entries` e **nunca** em `savings_entries`
 * (movimentação interna, aliás, nem é importada — T-088). Apagar poupança aqui é
 * perda líquida: não existe nada no lote de entrada que a recomponha.
 *
 * **Nada é apagado fora dessas três tabelas** — nem o usuário, nem o catálogo de
 * planos. As tabelas legadas de Metas (`goals` e a coluna
 * `savings_entries.goal_id`) não aparecem mais nesta lista porque **não existem**:
 * foram apagadas do banco na T-091b2. O que restou de Metas é o `transfer_group`
 * da T-041, e ele não muda nada aqui — as duas pontas de um par legado são linhas
 * de `savings_entries`, então o par some inteiro e nunca sobra meia transferência.
 *
 * ## Atomicidade
 *
 * Os três DELETEs vão num `db.batch` só. Meio caminho — despesas apagadas e
 * rendas não — deixaria o usuário com um mês negativo inventado, e não há
 * desfazer. Ou apaga os três, ou nenhum.
 *
 * ## Por que neste package
 *
 * `savings_entries` é território do `savings-core`, e isto o toca. A alternativa
 * — a rota chamar dois cores em sequência — quebraria a atomicidade acima, que é
 * a propriedade que importa numa operação sem volta. Fica aqui, junto do resto
 * da política de importação (o dono do modo replace), com a dependência
 * declarada em vez de escondida.
 */
export interface WipeUserFinancialEntriesParams {
  db: Db;
  userId: number;
}

export interface WipeUserFinancialEntriesResult {
  incomeEntries: number;
  expenseEntries: number;
  savingsEntries: number;
}

export async function wipeUserFinancialEntries(
  params: WipeUserFinancialEntriesParams
): Promise<WipeUserFinancialEntriesResult> {
  const { db, userId } = params;

  // Conta ANTES de apagar: o relatório precisa dizer quanto sumiu, e depois do
  // DELETE não há mais o que contar.
  const [income, expense, savings] = await Promise.all([
    db.execute({
      sql: 'SELECT COUNT(*) AS c FROM income_entries WHERE user_id = ?',
      args: [userId],
    }),
    db.execute({
      sql: 'SELECT COUNT(*) AS c FROM expense_entries WHERE user_id = ?',
      args: [userId],
    }),
    db.execute({
      sql: 'SELECT COUNT(*) AS c FROM savings_entries WHERE user_id = ?',
      args: [userId],
    }),
  ]);

  await db.batch(
    [
      { sql: 'DELETE FROM income_entries WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM expense_entries WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM savings_entries WHERE user_id = ?', args: [userId] },
    ],
    'write'
  );

  return {
    incomeEntries: Number(income.rows[0].c),
    expenseEntries: Number(expense.rows[0].c),
    savingsEntries: Number(savings.rows[0].c),
  };
}
