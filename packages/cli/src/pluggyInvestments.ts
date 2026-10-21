// Run from workspace root:
//   pnpm --filter vetor-wallet-cli pluggy:investments [--dry-run] [--email=...]
//
// DIAGNÓSTICO de `GET /investments` da Pluggy (T-091d, fatia d1): para cada item
// do usuário, quantos investimentos a Pluggy devolve e quantos de cada `type`.
// Serve para o humano ver a FORMA real do dado antes de a fatia d2 decidir o
// mapeamento para o `fixed-income-core`.
//
// IMPRIME SÓ ESTRUTURA. Nada de nome de ativo, valor, instituição, código do
// papel ou id de investimento — o repo é público e saída de terminal acaba em
// BACKLOG.md, PR e Discord (CLAUDE.md da raiz). A contagem vem pronta de
// `summarizePluggyInvestments` (pluggy-core), que tem teste garantindo que nada
// disso vaza; o `itemId` sai mascarado (`maskItemId`).
//
// NUNCA GRAVA NADA: não existe escrita de investimento ainda. `--dry-run` é
// aceito só por consistência com `pluggy:sync`/`pluggy:link` e é informativo.
//
// Sai por `process.exitCode`, não `process.exit()` — sockets HTTPS abertos
// abortam o Node no Windows (ver pluggySync.ts).

import 'dotenv/config';
import { db, initDb } from '@vetor-wallet/db';
import { listPluggyItems } from '@vetor-wallet/bank-import-core';
import { fetchPluggyInvestments, summarizePluggyInvestments } from '@vetor-wallet/pluggy-core';
import { maskItemId, resolvePluggyUserId } from './pluggyCli';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  await initDb();
  const userId = await resolvePluggyUserId(args);
  const items = await listPluggyItems({ db, userId });

  if (items.length === 0) {
    console.error(
      '[pluggyInvestments] Este usuário não tem nenhuma conexão da Pluggy registrada.\n' +
        '                    Registre uma com:  pnpm --filter vetor-wallet-cli pluggy:link <itemId>'
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `[pluggyInvestments] Lendo investimentos de ${items.length} item(ns) — ` +
      `só leitura, nada é gravado${dryRun ? ' (--dry-run é só informativo aqui)' : ''}.`
  );

  let failures = 0;
  let grandTotal = 0;
  for (const item of items) {
    const header = `  Item ${maskItemId(item.itemId)} (${item.connectorName ?? 'conector ?'})`;
    try {
      const summary = summarizePluggyInvestments(await fetchPluggyInvestments(item.itemId));
      grandTotal += summary.total;
      const byType = Object.entries(summary.byType)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');
      console.log(`${header} — ${summary.total} investimento(s)${byType ? ` | ${byType}` : ''}`);
    } catch (err) {
      failures++;
      console.error(`${header}\n    [FAIL] ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `\n[pluggyInvestments] Resumo — ${items.length} item(ns), ${failures} falha(s), ` +
      `${grandTotal} investimento(s) no total.`
  );
  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(
    `[pluggyInvestments] Erro fatal: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exitCode = 1;
});
