import type { Query } from '@vetor-wallet/query';
import { insertEntryWithExternalId } from './insertEntryWithExternalId';
import {
  mapPluggyTransaction,
  parsePluggyDate,
  type PluggyAccountKind,
  type PluggyImportLine,
  type PluggyImportResult,
  type RawPluggyTransaction,
} from './pluggy';

export interface ImportPluggyTransactionsParams {
  query: Query;
  userId: number;
  transactions: RawPluggyTransaction[];
  /** Tipo da conta de origem — decide a convenção de sinal. Default `BANK`. */
  accountKind?: PluggyAccountKind;
  /** `true` = não escreve NADA no banco; as linhas mapeadas viram `previewed`. */
  dryRun?: boolean;
}

/**
 * Importa um lote de transações da Pluggy para `income_entries`/`expense_entries`.
 *
 * - **Os INSERTs são sequenciais, não em lote** — cada um precisa VER o
 *   anterior para que o mesmo id repetido dentro do próprio lote caia como
 *   duplicata em vez de estourar o índice único e derrubar o lote (mesma decisão
 *   da T-085).
 * - **`dryRun` corta antes de qualquer chamada ao banco.** É a garantia que o
 *   `--dry-run` do job promete, e ela vive aqui (num lugar só, testável) em vez
 *   de num `if` do CLI.
 * - Duplicata **não é erro**: é linha do relatório (T-084, convenção de lote).
 * - **Movimentação interna nunca chega ao banco** (T-088), com ou sem
 *   `dryRun` — ela é cortada no mapeamento, então o `external_id` daquela
 *   transação segue **livre**. Isso é o que permite que, quando o layer de
 *   investimentos existir, uma nova sincronização da mesma janela importe as
 *   linhas `Investments` sem esbarrar no dedupe.
 */
export async function importPluggyTransactions(
  params: ImportPluggyTransactionsParams
): Promise<PluggyImportResult> {
  const { query, userId, transactions, accountKind = 'BANK', dryRun = false } = params;

  const lines: PluggyImportLine[] = [];
  let imported = 0;
  let duplicated = 0;
  let rejected = 0;
  let skipped = 0;
  let internal = 0;
  let previewed = 0;

  for (const raw of transactions) {
    const mapped = mapPluggyTransaction(raw, accountKind);

    if (!mapped.ok) {
      if (mapped.outcome === 'skipped') skipped++;
      else if (mapped.outcome === 'internal') internal++;
      else rejected++;
      // Campos crus quando legíveis: identificam a linha no relatório mesmo
      // quando foi outro campo que derrubou a transação (padrão do OFX).
      const rawDate = parsePluggyDate(raw.date);
      lines.push({
        status: mapped.outcome,
        reason: mapped.reason,
        ...(raw.id ? { transactionId: raw.id } : {}),
        ...(rawDate ? { date: rawDate } : {}),
        ...(typeof raw.amount === 'number' && Number.isFinite(raw.amount)
          ? { amount: Math.abs(raw.amount) }
          : {}),
        ...(raw.description ? { description: raw.description } : {}),
      });
      continue;
    }

    const tx = mapped.transaction;
    const base: PluggyImportLine = {
      status: 'previewed',
      transactionId: tx.transactionId,
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      entryType: tx.entryType,
    };

    if (dryRun) {
      previewed++;
      lines.push(base);
      continue;
    }

    const isIncome = tx.entryType === 'income';
    const result = await insertEntryWithExternalId({
      query,
      table: isIncome ? 'income_entries' : 'expense_entries',
      userId,
      values: isIncome
        ? { description: tx.description, amount: tx.amount, date: tx.date }
        : {
            description: tx.description,
            amount: tx.amount,
            date: tx.date,
            category: tx.category,
          },
      externalId: tx.externalId,
    });

    const entryId = result.row ? Number(result.row.id) : undefined;
    if (result.status === 'duplicate') duplicated++;
    else imported++;
    lines.push({
      ...base,
      status: result.status === 'duplicate' ? 'duplicated' : 'imported',
      ...(entryId !== undefined ? { entryId } : {}),
    });
  }

  return { imported, duplicated, rejected, skipped, internal, previewed, transactions: lines };
}
