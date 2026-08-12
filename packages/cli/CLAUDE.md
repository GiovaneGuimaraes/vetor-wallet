# CLAUDE.md — vetor-wallet-cli

Instruções específicas do package `cli/`. Leia em conjunto com o `CLAUDE.md` da raiz.

---

## Responsabilidade

CLIs de coleta e manutenção de dados, sem dependência do Express. Cada script é uma função exportada por um package `*-core` envelopada num entry point mínimo — estruturada para virar um handler Lambda fino no futuro.

---

## Estrutura

```
cli/
├── src/
│   ├── hourlyInsights.ts  # job de captura horária de cotações B3
│   ├── pluggyCli.ts       # plumbing dos dois jobs Pluggy (argv/env, máscara)
│   ├── pluggyLink.ts      # registra/remove um item da Pluggy p/ um usuário (T-089a)
│   ├── pluggySync.ts      # sincronização Open Finance via Pluggy (T-087/T-089a)
│   └── grantAdmin.ts      # concede a role admin a um e-mail
├── .env.example           # DATABASE_URL, BRAPI_TOKEN, PLUGGY_*
├── package.json           # vetor-wallet-cli; scripts: insights:hourly,
│                          # pluggy:link, pluggy:sync, roles:grant-admin
└── tsconfig.json          # path aliases para os packages consumidos
```

---

## Como rodar

```bash
# 1. Criar o .env (necessário apenas na primeira vez)
cp packages/cli/.env.example packages/cli/.env

# 2. Rodar o job (a partir da raiz do workspace)
pnpm --filter vetor-wallet-cli insights:hourly

# Com data específica (YYYY-MM-DD):
pnpm --filter vetor-wallet-cli insights:hourly 2025-07-10
```

Sem argumento de data, o job usa o dia útil anterior em BRT.

### Pluggy: primeiro vincular o item, depois sincronizar (T-089a)

Desde a T-089a o `pluggy:sync` **não lê mais `PLUGGY_ITEM_ID`**: as conexões
vivem na tabela `pluggy_items`, por usuário. As rotas e o botão do app (fases (b)
e (c) da T-089) **não existem ainda**, então **hoje o único caminho para criar a
linha é o `pluggy:link`** — sem ele, o `pluggy:sync` responde "nenhuma conexão
registrada" e sai com código 1.

```bash
# 1. Vincular o item ao usuário — uma vez por instituição conectada.
#    Sem argumento, usa PLUGGY_ITEM_ID do .env (bootstrap de quem vem da T-087).
pnpm --filter vetor-wallet-cli pluggy:link
pnpm --filter vetor-wallet-cli pluggy:link <itemId> --connector-id=200 --connector-name=MeuPluggy
pnpm --filter vetor-wallet-cli pluggy:link <itemId> --email=voce@exemplo.com

# Conferir o que está vinculado (o comando sempre lista ao final) / remover:
pnpm --filter vetor-wallet-cli pluggy:link <itemId> --remove

# 2. Sincronizar TODOS os items do usuário — sempre com --dry-run primeiro
pnpm --filter vetor-wallet-cli pluggy:sync --dry-run
pnpm --filter vetor-wallet-cli pluggy:sync            # janela default: 30 dias
pnpm --filter vetor-wallet-cli pluggy:sync 2026-07-01 # a partir desta data
```

Rodar o `pluggy:link` de novo com o mesmo item é seguro: o upsert atualiza a
linha existente (reconexão preserva o `itemId`). Item que já é de **outro**
usuário é recusado com `ITEM_ALREADY_LINKED`, sem dizer de quem é.

**Não há migração automática a partir do `.env`.** Vincular é ato explícito,
feito uma vez — um job que criasse a linha sozinho a partir de env presente em
runtime transformaria configuração de máquina em dado de usuário.

**O `itemId` nunca é impresso inteiro** (`maskItemId`, 8 primeiros caracteres): é
credencial portadora e saída de terminal acaba em print, issue e PR.

Um usuário com N items sincroniza os N; falha em um item (ou em uma conta) **não
aborta** os outros — o relatório mostra cada falha e o processo sai não-zero no
final.

`--dry-run` lista o que faria e **não grava nada** (a garantia vive em
`importPluggyTransactions`, no `bank-import-core`, não num `if` daqui). Rodar de
novo é seguro: o dedupe por `external_id` (T-084) faz a segunda passagem reportar
duplicatas em vez de duplicar lançamento. Saída não-zero = alguma conta falhou.

Este job sai por `process.exitCode`, **não** por `process.exit()`: ele mantém
sockets HTTPS abertos e derrubar o processo com handles de rede vivos aborta o
Node no Windows (`UV_HANDLE_CLOSING`, exit 127 — visto de verdade em smoke test).

---

## Variáveis de ambiente

| Variável | Exemplo | Obrigatório |
|---|---|---|
| `DATABASE_URL` | `file:../rest-api/data/wallet.db` | **Sim** |
| `BRAPI_TOKEN` | — | Não (limite maior com token) |
| `PLUGGY_CLIENT_ID` | — | Só para `pluggy:sync` |
| `PLUGGY_CLIENT_SECRET` | — | Só para `pluggy:sync` |
| `PLUGGY_ITEM_ID` | — | Não — só bootstrap do `pluggy:link` (T-089a) |
| `PLUGGY_USER_EMAIL` | `voce@exemplo.com` | Default do `--email=` nos dois jobs Pluggy |
| `PLUGGY_API_URL` | `https://api.pluggy.ai` | Não (default) |

**Credenciais nunca entram no repositório**: no diff vai só o `.env.example` com
os nomes e valores vazios; quem preenche o `.env` (git-ignored) é o humano. Nada
de `apiKey`/`clientSecret` em log ou mensagem de erro — ver
`packages/pluggy-core/CLAUDE.md`.

`PLUGGY_USER_EMAIL` existe porque toda tabela de dados filtra por `user_id` e um
job não tem sessão HTTP: é o e-mail do usuário do app sobre o qual o comando age,
resolvido em `users.id` via `findUserByEmail`. Desde a T-089a ele é o **default
do CLI** — `--email=` no comando ganha dele —, e não mais "o usuário dono de
tudo": com items por usuário, quem manda é a linha em `pluggy_items`. A
invariante que **não** mudou: **sem default silencioso** — sem `--email=` nem
env, ou com e-mail inexistente, o comando falha; nunca escolhemos um usuário por
conta própria.

`PLUGGY_ITEM_ID` **não é lido pelo `pluggy:sync`** (T-089a). Sobrou como
conveniência de bootstrap do `pluggy:link`, que o usa quando nenhum `itemId` vem
por argumento.

`DATABASE_URL` é relativo ao diretório onde o script roda (`packages/cli/`), então `../rest-api/data/wallet.db` aponta corretamente para o banco da API. Para Turso: `libsql://seu-db.turso.io?authToken=...`.

> **Atenção (T-100)**: o package se chamava `server` até 2026-08-09. Um `.env` local
> antigo com `file:../server/data/wallet.db` **não dá erro** — o libsql cria um banco
> novo e vazio nesse caminho, e o job roda "com sucesso" sobre nada. Se o job parecer
> não enxergar seus dados, confira esta variável primeiro.

---

## Imports e path aliases

O `tsconfig.json` do CLI aponta cada package consumido para o **código-fonte**, não
para o `dist/`: `@vetor-wallet/{shared,db,validation-core,auth-core,insights-core,
bank-import-core,pluggy-core}` e, como transitivos de `auth-core`/`insights-core`,
`@vetor-wallet/{portfolio-core,brapi-core}`.
Os transitivos existem de propósito — sem eles o `tsx` cairia na resolução do Node e
exigiria o `dist` desses cores já construído, e um job de CLI não pode depender de
`pnpm build` ter rodado antes.

O CLI **não** tem alias para dentro da API (o `@vetor-wallet/server/*` saiu na T-099c,
quando `services/` deixou de existir). Ele importa dos cores:

```typescript
import { initDb } from '@vetor-wallet/db';
import { runHourlyInsightsJob } from '@vetor-wallet/insights-core';
```

**Não adicione lógica de negócio diretamente nos arquivos de `cli/src/`** — ela pertence ao `*-core` do domínio. O CLI só chama `initDb()`, invoca o job e loga o resultado.

---

## Adicionando um novo CLI

1. Criar `cli/src/<nome>.ts` — chama `initDb()` + função do serviço + loga + `process.exit`.
2. Adicionar script em `cli/package.json`: `"<nome>": "tsx src/<nome>.ts"`.
3. A lógica de negócio fica no `*-core` do domínio, com seus testes.

---

## TODO futuro

Quando o deploy em AWS Lambda + EventBridge for feito, cada `cli/src/*.ts` vira um handler:

```typescript
// lambda/hourlyInsights.ts (exemplo)
import { initDb } from '@vetor-wallet/db';
import { runHourlyInsightsJob } from '@vetor-wallet/insights-core';

export const handler = async () => {
  await initDb();
  return runHourlyInsightsJob();
};
```

A migração exige `DATABASE_URL` apontando para Turso (SQLite remoto) — sem isso, Lambda não tem acesso ao arquivo local.
