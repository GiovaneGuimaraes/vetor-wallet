// Run from workspace root:
//   pnpm --filter vetor-wallet-cli pluggy:sync [YYYY-MM-DD] [--dry-run] [--email=...]
//
// Requer, em packages/cli/.env (ver .env.example): DATABASE_URL,
// PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e o usuário (--email= ou
// PLUGGY_USER_EMAIL). As credenciais são do humano e NUNCA entram no
// repositório.
//
// **`PLUGGY_ITEM_ID` não é mais lido aqui** (T-089a): os items vivem em
// `pluggy_items`, por usuário. Se o usuário não tem nenhum item, registre um com
//   pnpm --filter vetor-wallet-cli pluggy:link <itemId>
//
// Este arquivo só ORQUESTRA A BORDA: lê argv/env, injeta o client
// (@vetor-wallet/pluggy-core) no job do core (@vetor-wallet/bank-import-core) e
// imprime o relatório. Quem itera items/contas e decide o que é falha é
// `syncPluggyItems` — nenhuma regra de negócio aqui (ver packages/cli/CLAUDE.md).

import 'dotenv/config';
import { db, initDb } from '@vetor-wallet/db';
import { isValidIsoDate } from '@vetor-wallet/validation-core';
import { fetchPluggyAccounts, fetchPluggyTransactions } from '@vetor-wallet/pluggy-core';
import {
  syncPluggyItems,
  type PluggyImportResult,
  type PluggySyncItemReport,
} from '@vetor-wallet/bank-import-core';
import { maskItemId, resolvePluggyUserId } from './pluggyCli';

const DEFAULT_WINDOW_DAYS = 30;

/** `dateFrom` default: hoje − 30 dias (UTC). Reimportar é idempotente (T-084). */
function defaultDateFrom(): string {
  const from = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return from.toISOString().slice(0, 10);
}

function printLines(result: PluggyImportResult): void {
  for (const line of result.transactions) {
    const money = line.amount !== undefined ? line.amount.toFixed(2) : '—';
    const label = line.description ?? line.transactionId ?? '(sem descrição)';
    const suffix = line.reason ? ` — ${line.reason}` : '';
    console.log(
      `      [${line.status.toUpperCase()}] ${line.date ?? '----------'} ${money} ${label}${suffix}`
    );
  }
}

function printItem(item: PluggySyncItemReport): void {
  const header = `  Item ${maskItemId(item.itemId)} (${item.connectorName ?? 'conector ?'})`;
  if (item.error) {
    console.error(`${header}\n    [FAIL] ${item.error}`);
    return;
  }
  console.log(`${header} — ${item.accounts.length} conta(s)`);

  for (const account of item.accounts) {
    if (account.error || !account.result) {
      console.error(`    [FAIL] ${account.label}: ${account.error ?? 'sem resultado'}`);
      continue;
    }
    const r = account.result;
    console.log(
      `    [OK]   ${account.label}: ${account.fetched} transação(ões) — ` +
        `${r.previewed} a importar, ${r.imported} importada(s), ${r.duplicated} duplicada(s), ` +
        `${r.skipped} pulada(s), ${r.rejected} rejeitada(s)`
    );
    printLines(r);
  }
}

/**
 * Saída do processo por `process.exitCode`, **não** por `process.exit()`: este
 * job abre sockets HTTPS (as N+1 requests à Pluggy) e derrubar o processo com
 * handles de rede abertos aborta o Node no Windows
 * (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, exit 127 — visto de
 * verdade no smoke test). Marcar o código e deixar o event loop drenar sai com
 * o código certo. Os jobs antigos usam `process.exit()` porque não têm keep-alive
 * de HTTP no caminho normal.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dateArg = args.find((a) => !a.startsWith('--'));

  if (dateArg && !isValidIsoDate(dateArg)) {
    console.error(`[pluggySync] Data inválida: "${dateArg}" — esperado YYYY-MM-DD real`);
    process.exitCode = 1;
    return;
  }
  const dateFrom = dateArg ?? defaultDateFrom();

  await initDb();
  const userId = await resolvePluggyUserId(args);

  console.log(
    `[pluggySync] Sincronizando os items do usuário desde ${dateFrom}` +
      `${dryRun ? ' (DRY-RUN: nada será gravado)' : ''}...`
  );

  const report = await syncPluggyItems({
    db,
    userId,
    dateFrom,
    dryRun,
    deps: {
      fetchAccounts: (itemId) => fetchPluggyAccounts(itemId),
      fetchTransactions: ({ accountId, dateFrom: from }) =>
        fetchPluggyTransactions({ accountId, dateFrom: from }),
    },
  });

  if (report.noItems) {
    // Falha ALTA de propósito: "0 contas, sucesso" é a falha silenciosa mais
    // provável desta integração. Sem item não há nada a sincronizar, e a saída
    // tem de dizer o que fazer a respeito.
    console.error(
      '[pluggySync] Este usuário não tem nenhuma conexão da Pluggy registrada.\n' +
        '             Registre uma com:  pnpm --filter vetor-wallet-cli pluggy:link <itemId>\n' +
        '             (como obter um itemId: packages/pluggy-core/CLAUDE.md)'
    );
    process.exitCode = 1;
    return;
  }

  for (const item of report.items) printItem(item);

  const t = report.totals;
  console.log(
    `\n[pluggySync] Resumo — ${report.items.length} item(ns), ${report.failures} falha(s) | ` +
      `${t.previewed} a importar, ${t.imported} importada(s), ${t.duplicated} duplicada(s), ` +
      `${t.skipped} pulada(s), ${t.rejected} rejeitada(s)`
  );

  process.exitCode = report.failures > 0 ? 1 : 0;
}

main().catch((err) => {
  // `PluggyApiError` e erros de env chegam aqui: mensagem própria, sem stack de
  // request (que poderia carregar credenciais no `cause`).
  console.error(`[pluggySync] Erro fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
