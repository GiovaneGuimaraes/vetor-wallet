// Run from workspace root:
//   pnpm --filter vetor-wallet-cli pluggy:link [itemId] [--email=...] \
//        [--connector-id=200] [--connector-name=MeuPluggy] [--remove]
//
// Registra (ou remove) uma conexão da Pluggy para um usuário do app — a linha
// em `pluggy_items` que o `pluggy:sync` passou a usar no lugar de
// `PLUGGY_ITEM_ID` (T-089a).
//
// POR QUE ESTE COMANDO EXISTE: a tabela nasceu antes da UI. Enquanto as fases
// (b) rota e (c) botão não existirem, este é o ÚNICO jeito de criar a linha — e
// sem ela o `pluggy:sync` não tem o que sincronizar. Não há migração automática
// a partir do `.env`: registrar o item é um ato explícito, feito uma vez, não um
// efeito colateral de rodar um job.
//
// O `itemId` pode vir como argumento ou, na falta dele, de `PLUGGY_ITEM_ID`
// (bootstrap de quem já tinha o `.env` da T-087). Ele NUNCA é impresso inteiro:
// é credencial portadora — ver `maskItemId`.

import 'dotenv/config';
import { db, initDb } from '@vetor-wallet/db';
import {
  linkPluggyItem,
  listPluggyItems,
  unlinkPluggyItem,
  PluggyItemError,
} from '@vetor-wallet/bank-import-core';
import { flagValue, maskItemId, resolvePluggyUserId } from './pluggyCli';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const remove = args.includes('--remove');
  const itemId = (args.find((a) => !a.startsWith('--')) ?? process.env.PLUGGY_ITEM_ID ?? '').trim();

  if (!itemId) {
    console.error(
      '[pluggyLink] itemId ausente: passe como argumento ou defina PLUGGY_ITEM_ID no .env do cli.\n' +
        '            Como obter um itemId novo: packages/pluggy-core/CLAUDE.md.'
    );
    process.exitCode = 1;
    return;
  }

  await initDb();
  const userId = await resolvePluggyUserId(args);

  if (remove) {
    const removed = await unlinkPluggyItem({ db, userId, itemId });
    if (!removed) {
      // "não encontrado" cobre tanto o item inexistente quanto o de outro
      // usuário — de propósito: nada aqui confirma vínculo alheio.
      console.error(`[pluggyLink] Nenhum item ${maskItemId(itemId)} vinculado a este usuário.`);
      process.exitCode = 1;
      return;
    }
    console.log(`[pluggyLink] Item ${maskItemId(itemId)} removido.`);
  } else {
    const connectorIdArg = flagValue(args, 'connector-id');
    const connectorId = connectorIdArg ? Number(connectorIdArg) : null;
    if (connectorIdArg && !Number.isInteger(connectorId)) {
      console.error(`[pluggyLink] --connector-id inválido: "${connectorIdArg}"`);
      process.exitCode = 1;
      return;
    }

    const item = await linkPluggyItem({
      db,
      userId,
      itemId,
      connectorId,
      connectorName: flagValue(args, 'connector-name') ?? null,
      status: flagValue(args, 'status') ?? null,
    });
    // Rodar de novo com o mesmo item é seguro: o upsert atualiza a linha
    // existente em vez de duplicar ou estourar.
    console.log(
      `[pluggyLink] Item ${maskItemId(item.itemId)} vinculado ` +
        `(conector ${item.connectorName ?? item.connectorId ?? '—'}, status ${item.status}).`
    );
  }

  const items = await listPluggyItems({ db, userId });
  console.log(`[pluggyLink] O usuário tem agora ${items.length} item(ns):`);
  for (const it of items) {
    console.log(`  - ${maskItemId(it.itemId)} — ${it.connectorName ?? '—'} — ${it.status}`);
  }
}

main().catch((err) => {
  // `PluggyItemError` chega aqui com mensagem própria (item já vinculado a outra
  // conta, itemId inválido); nada de credencial em log.
  const message = err instanceof Error ? err.message : String(err);
  const code = err instanceof PluggyItemError ? ` [${err.code}]` : '';
  console.error(`[pluggyLink] Erro:${code} ${message}`);
  process.exitCode = 1;
});
