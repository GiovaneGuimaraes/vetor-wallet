import type { Db } from '@vetor-wallet/db';
import { listPluggyItems } from './listPluggyItems';
import {
  importPluggyTransactions,
  type PluggyAccountKind,
  type PluggyImportResult,
  type RawPluggyTransaction,
} from './pluggy';

/**
 * Sincronização de TODOS os items de um usuário (T-089a).
 *
 * Até a T-087 o job do `cli` lia um `PLUGGY_ITEM_ID` do `.env` e sincronizava
 * um item só. Com `pluggy_items` o usuário pode ter N conexões (o conector 200
 * cria **um item por instituição**), então quem orquestra precisa iterar — e
 * isolar falha.
 *
 * Isto vive no core, e não no `cli`, porque é regra: quantos items, em que
 * ordem, o que conta como falha e o que **não** aborta o resto. O `cli` só
 * injeta o client e imprime (ver `packages/cli/CLAUDE.md`).
 *
 * **O client da Pluggy chega INJETADO**, não importado: `bank-import-core` é
 * Core e `pluggy-core` é Integração — depender dele aqui inverteria a direção
 * (regra 2/3 de `docs/PACKAGES.md`) e faria este package precisar de `fetch`
 * mockado para testar uma regra que não é de HTTP. As formas são estruturais,
 * pelo mesmo motivo de `RawPluggyTransaction`.
 */

/** Conta como o client da Pluggy a entrega — forma mínima que usamos. */
export interface RawPluggyAccount {
  id: string | null;
  name: string | null;
  /** `BANK` | `CREDIT` — decide a convenção de sinal do valor. */
  type: string | null;
  subtype: string | null;
}

export interface PluggySyncDeps {
  fetchAccounts(itemId: string): Promise<RawPluggyAccount[]>;
  fetchTransactions(params: {
    accountId: string;
    dateFrom: string;
  }): Promise<RawPluggyTransaction[]>;
}

export interface PluggySyncAccountReport {
  label: string;
  accountId: string | null;
  fetched: number;
  /** Ausente quando a conta falhou. */
  result?: PluggyImportResult;
  /** Motivo da falha desta conta — as outras seguem. */
  error?: string;
}

export interface PluggySyncItemReport {
  itemId: string;
  connectorName: string | null;
  accounts: PluggySyncAccountReport[];
  /** Motivo da falha do item inteiro (listar contas falhou, ou item sem conta). */
  error?: string;
  /** Contas que falharam + 1 quando o item inteiro falhou. */
  failures: number;
}

export interface PluggySyncTotals {
  imported: number;
  duplicated: number;
  rejected: number;
  skipped: number;
  previewed: number;
}

export interface PluggySyncReport {
  items: PluggySyncItemReport[];
  totals: PluggySyncTotals;
  /** Soma das falhas de todos os items. Saída não-zero do job. */
  failures: number;
  /** `true` = o usuário não tem NENHUM item — não é sucesso com 0 contas. */
  noItems: boolean;
}

export interface SyncPluggyItemsParams {
  db: Db;
  userId: number;
  /** `YYYY-MM-DD` — piso da janela de transações. */
  dateFrom: string;
  dryRun?: boolean;
  deps: PluggySyncDeps;
}

/** `CREDIT` (cartão) inverte o sinal do valor; qualquer outra coisa é conta. */
export function pluggyAccountKindOf(type: string | null): PluggyAccountKind {
  return type?.trim().toUpperCase() === 'CREDIT' ? 'CREDIT' : 'BANK';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Sincroniza os N items do usuário, item a item e conta a conta.
 *
 * Invariantes:
 *
 * - **Os items vêm de `listPluggyItems`**, sempre filtrado por `user_id`: item
 *   de outro usuário não é sincronizável nem por acidente de argumento.
 * - **Falha em um item não aborta os outros**, e falha em uma conta não aborta
 *   as outras contas do mesmo item. Cada falha vira linha do relatório e soma em
 *   `failures` — o job sai com código não-zero, mas depois de ter importado tudo
 *   que dava.
 * - **`noItems` é desfecho próprio, não sucesso vazio.** "0 contas, sucesso" é a
 *   falha silenciosa mais provável desta integração (o usuário nunca conectou o
 *   banco, ou o item foi removido) e precisa de mensagem acionável.
 * - **Item sem nenhuma conta é FALHA do item**, pelo mesmo motivo: item existe
 *   mas a ligação com a instituição não foi concluída, ou o item é de outra
 *   aplicação da Pluggy.
 * - Nada de segredo aqui: o relatório carrega `itemId` e rótulo de conta, nunca
 *   credencial (ver `packages/pluggy-core/CLAUDE.md`).
 */
export async function syncPluggyItems(params: SyncPluggyItemsParams): Promise<PluggySyncReport> {
  const { db, userId, dateFrom, dryRun = false, deps } = params;

  const items = await listPluggyItems({ db, userId });
  const totals: PluggySyncTotals = {
    imported: 0,
    duplicated: 0,
    rejected: 0,
    skipped: 0,
    previewed: 0,
  };

  if (items.length === 0) {
    return { items: [], totals, failures: 0, noItems: true };
  }

  const reports: PluggySyncItemReport[] = [];
  let failures = 0;

  for (const item of items) {
    const report: PluggySyncItemReport = {
      itemId: item.itemId,
      connectorName: item.connectorName,
      accounts: [],
      failures: 0,
    };
    reports.push(report);

    let accounts: RawPluggyAccount[];
    try {
      accounts = await deps.fetchAccounts(item.itemId);
    } catch (err) {
      report.error = errorMessage(err);
      report.failures += 1;
      failures += 1;
      continue;
    }

    if (accounts.length === 0) {
      report.error =
        'O item não tem nenhuma conta. Confira se a ligação com a instituição ' +
        'financeira foi concluída no Meu Pluggy — ou remova o item.';
      report.failures += 1;
      failures += 1;
      continue;
    }

    for (const account of accounts) {
      const label = `${account.name ?? 'conta'} (${account.type ?? '?'}/${account.subtype ?? '?'})`;
      const accountReport: PluggySyncAccountReport = {
        label,
        accountId: account.id,
        fetched: 0,
      };
      report.accounts.push(accountReport);

      if (!account.id) {
        accountReport.error = 'conta sem id no payload da Pluggy';
        report.failures += 1;
        failures += 1;
        continue;
      }

      try {
        const transactions = await deps.fetchTransactions({ accountId: account.id, dateFrom });
        const result = await importPluggyTransactions({
          userId,
          transactions,
          accountKind: pluggyAccountKindOf(account.type),
          dryRun,
        });

        accountReport.fetched = transactions.length;
        accountReport.result = result;
        totals.imported += result.imported;
        totals.duplicated += result.duplicated;
        totals.rejected += result.rejected;
        totals.skipped += result.skipped;
        totals.previewed += result.previewed;
      } catch (err) {
        accountReport.error = errorMessage(err);
        report.failures += 1;
        failures += 1;
      }
    }
  }

  return { items: reports, totals, failures, noItems: false };
}
