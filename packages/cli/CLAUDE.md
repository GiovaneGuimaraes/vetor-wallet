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
│   ├── pluggySync.ts      # sincronização Open Finance via Pluggy (T-087)
│   └── grantAdmin.ts      # concede a role admin a um e-mail
├── .env.example           # DATABASE_URL, BRAPI_TOKEN, PLUGGY_*
├── package.json           # vetor-wallet-cli; scripts: insights:hourly,
│                          # pluggy:sync, roles:grant-admin
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

```bash
# Sincronização Pluggy (T-087) — sempre confira com --dry-run primeiro
pnpm --filter vetor-wallet-cli pluggy:sync --dry-run
pnpm --filter vetor-wallet-cli pluggy:sync            # janela default: 30 dias
pnpm --filter vetor-wallet-cli pluggy:sync 2026-07-01 # a partir desta data
```

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
| `PLUGGY_ITEM_ID` | — | Só para `pluggy:sync` |
| `PLUGGY_USER_EMAIL` | `voce@exemplo.com` | Só para `pluggy:sync` |
| `PLUGGY_API_URL` | `https://api.pluggy.ai` | Não (default) |

**Credenciais nunca entram no repositório**: no diff vai só o `.env.example` com
os nomes e valores vazios; quem preenche o `.env` (git-ignored) é o humano. Nada
de `apiKey`/`clientSecret` em log ou mensagem de erro — ver
`packages/pluggy-core/CLAUDE.md`.

`PLUGGY_USER_EMAIL` existe porque toda tabela de dados filtra por `user_id` e um
job não tem sessão HTTP: é o e-mail do usuário do app que **recebe** os
lançamentos, resolvido em `users.id` via `findUserByEmail`. Sem default
silencioso — env ausente ou e-mail inexistente faz o job falhar.

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
