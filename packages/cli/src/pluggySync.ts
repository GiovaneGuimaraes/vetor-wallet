// Run from workspace root:
//   pnpm --filter vetor-wallet-cli pluggy:sync [YYYY-MM-DD] [--dry-run]
//
// Requer, em packages/cli/.env (ver .env.example): DATABASE_URL,
// PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_ITEM_ID e PLUGGY_USER_EMAIL.
// As credenciais são do humano e NUNCA entram no repositório.
//
// Este arquivo só ORQUESTRA: lê env, chama o client
// (@vetor-wallet/pluggy-core), chama o mapeamento/gravação
// (@vetor-wallet/bank-import-core) e imprime o relatório. Nenhuma regra de
// negócio aqui — ver packages/cli/CLAUDE.md.

import 'dotenv/config';
import { initDb } from '@vetor-wallet/db';
import { findUserByEmail } from '@vetor-wallet/auth-core';
import { isValidIsoDate } from '@vetor-wallet/validation-core';
import { fetchPluggyAccounts, fetchPluggyTransactions } from '@vetor-wallet/pluggy-core';
import {
  importPluggyTransactions,
  type PluggyAccountKind,
  type PluggyImportResult,
} from '@vetor-wallet/bank-import-core';

const DEFAULT_WINDOW_DAYS = 30;

/**
 * De QUEM são estes lançamentos: toda tabela de dados filtra por `user_id`, e
 * um job sem sessão HTTP não tem usuário implícito. O e-mail vem do `.env`
 * (`PLUGGY_USER_EMAIL`) e é resolvido em `users.id` — **sem "usuário default"
 * silencioso**: se a env faltar ou o e-mail não existir, o job falha.
 */
async function resolveUserId(): Promise<number> {
  const email = (process.env.PLUGGY_USER_EMAIL ?? '').trim();
  if (!email) {
    throw new Error(
      'PLUGGY_USER_EMAIL ausente: defina no .env do cli o e-mail do usuário dono dos lançamentos'
    );
  }
  const user = await findUserByEmail(email);
  if (!user) throw new Error(`Usuário não encontrado para PLUGGY_USER_EMAIL: ${email}`);
  return user.id;
}

/** `dateFrom` default: hoje − 30 dias (UTC). Reimportar é idempotente (T-084). */
function defaultDateFrom(): string {
  const from = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return from.toISOString().slice(0, 10);
}

function accountKindOf(type: string | null): PluggyAccountKind {
  return type?.toUpperCase() === 'CREDIT' ? 'CREDIT' : 'BANK';
}

function printLines(result: PluggyImportResult): void {
  for (const line of result.transactions) {
    const money = line.amount !== undefined ? line.amount.toFixed(2) : '—';
    const label = line.description ?? line.transactionId ?? '(sem descrição)';
    const suffix = line.reason ? ` — ${line.reason}` : '';
    console.log(
      `    [${line.status.toUpperCase()}] ${line.date ?? '----------'} ${money} ${label}${suffix}`
    );
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

  const itemId = (process.env.PLUGGY_ITEM_ID ?? '').trim();
  if (!itemId) {
    console.error('[pluggySync] PLUGGY_ITEM_ID ausente: defina no .env do cli');
    process.exitCode = 1;
    return;
  }

  await initDb();
  const userId = await resolveUserId();

  console.log(
    `[pluggySync] Sincronizando item ${itemId} desde ${dateFrom}` +
      `${dryRun ? ' (DRY-RUN: nada será gravado)' : ''}...`
  );

  const accounts = await fetchPluggyAccounts(itemId);
  if (accounts.length === 0) {
    // Falha ALTA de propósito: "0 contas, sucesso" é a falha silenciosa mais
    // provável desta integração (item sem ligação OAuth, item de outra app).
    console.error(
      `[pluggySync] O item ${itemId} não tem nenhuma conta. Confira PLUGGY_ITEM_ID e se a ` +
        'ligação com a instituição financeira foi concluída no Meu Pluggy.'
    );
    process.exitCode = 1;
    return;
  }

  const totals = { imported: 0, duplicated: 0, rejected: 0, skipped: 0, previewed: 0 };
  let failures = 0;

  for (const account of accounts) {
    const label = `${account.name ?? 'conta'} (${account.type ?? '?'}/${account.subtype ?? '?'})`;
    if (!account.id) {
      failures++;
      console.error(`  [FAIL] ${label}: conta sem id no payload da Pluggy`);
      continue;
    }

    try {
      const transactions = await fetchPluggyTransactions({ accountId: account.id, dateFrom });
      const result = await importPluggyTransactions({
        userId,
        transactions,
        accountKind: accountKindOf(account.type),
        dryRun,
      });

      totals.imported += result.imported;
      totals.duplicated += result.duplicated;
      totals.rejected += result.rejected;
      totals.skipped += result.skipped;
      totals.previewed += result.previewed;

      console.log(
        `  [OK]   ${label}: ${transactions.length} transação(ões) — ` +
          `${result.previewed} a importar, ${result.imported} importada(s), ` +
          `${result.duplicated} duplicada(s), ${result.skipped} pulada(s), ` +
          `${result.rejected} rejeitada(s)`
      );
      printLines(result);
    } catch (err) {
      failures++;
      console.error(`  [FAIL] ${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `\n[pluggySync] Resumo — ${accounts.length} conta(s), ${failures} com falha | ` +
      `${totals.previewed} a importar, ${totals.imported} importada(s), ` +
      `${totals.duplicated} duplicada(s), ${totals.skipped} pulada(s), ` +
      `${totals.rejected} rejeitada(s)`
  );

  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((err) => {
  // `PluggyApiError` e erros de env chegam aqui: mensagem própria, sem stack de
  // request (que poderia carregar credenciais no `cause`).
  console.error(`[pluggySync] Erro fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
