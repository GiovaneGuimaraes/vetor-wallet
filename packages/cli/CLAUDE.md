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
│   └── hourlyInsights.ts  # job de captura horária de cotações B3
├── .env.example           # DATABASE_URL + BRAPI_TOKEN
├── package.json           # vetor-wallet-cli; script: insights:hourly
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

---

## Variáveis de ambiente

| Variável | Exemplo | Obrigatório |
|---|---|---|
| `DATABASE_URL` | `file:../rest-api/data/wallet.db` | **Sim** |
| `BRAPI_TOKEN` | — | Não (limite maior com token) |

`DATABASE_URL` é relativo ao diretório onde o script roda (`packages/cli/`), então `../rest-api/data/wallet.db` aponta corretamente para o banco da API. Para Turso: `libsql://seu-db.turso.io?authToken=...`.

> **Atenção (T-100)**: o package se chamava `server` até 2026-08-09. Um `.env` local
> antigo com `file:../server/data/wallet.db` **não dá erro** — o libsql cria um banco
> novo e vazio nesse caminho, e o job roda "com sucesso" sobre nada. Se o job parecer
> não enxergar seus dados, confira esta variável primeiro.

---

## Imports e path aliases

O `tsconfig.json` do CLI aponta cada package consumido para o **código-fonte**, não
para o `dist/`: `@vetor-wallet/{shared,db,validation-core,auth-core,insights-core}` e,
como transitivos de `auth-core`/`insights-core`, `@vetor-wallet/{portfolio-core,brapi-core}`.
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
