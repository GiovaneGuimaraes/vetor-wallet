# CLAUDE.md — vetor-wallet-cli

Instruções específicas do package `cli/`. Leia em conjunto com o `CLAUDE.md` da raiz.

---

## Responsabilidade

CLIs de coleta e manutenção de dados, sem dependência do Express. Cada script é uma função pura exportada do `server/services/` envelopada num entry point mínimo — estruturada para virar um handler Lambda fino no futuro.

---

## Estrutura

```
cli/
├── src/
│   └── hourlyInsights.ts  # job de captura horária de cotações B3
├── .env.example           # DATABASE_URL + BRAPI_TOKEN
├── package.json           # vetor-wallet-cli; script: insights:hourly
└── tsconfig.json          # path aliases para server e shared
```

---

## Como rodar

```bash
# 1. Criar o .env (necessário apenas na primeira vez)
cp cli/.env.example cli/.env

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
| `DATABASE_URL` | `file:../server/data/wallet.db` | **Sim** |
| `BRAPI_TOKEN` | — | Não (limite maior com token) |

`DATABASE_URL` é relativo ao diretório onde o script roda (`cli/`), então `../server/data/wallet.db` aponta corretamente para o banco do server. Para Turso: `libsql://seu-db.turso.io?authToken=...`.

---

## Imports e path aliases

O `tsconfig.json` do CLI define dois aliases:

| Alias | Resolve para |
|---|---|
| `@vetor-wallet/shared` | `../shared/src/index.ts` |
| `@vetor-wallet/server/*` | `../server/src/*` |

Isso permite importar serviços e o cliente de banco do server sem duplicar código:

```typescript
import { initDb } from '@vetor-wallet/server/db';
import { runHourlyInsightsJob } from '@vetor-wallet/server/services/hourlyInsights';
```

**Não adicione lógica de negócio diretamente nos arquivos de `cli/src/`** — ela pertence a `server/src/services/`. O CLI só chama `initDb()`, invoca o job e loga o resultado.

---

## Adicionando um novo CLI

1. Criar `cli/src/<nome>.ts` — chama `initDb()` + função do serviço + loga + `process.exit`.
2. Adicionar script em `cli/package.json`: `"<nome>": "tsx src/<nome>.ts"`.
3. A lógica de negócio fica em `server/src/services/<nome>.ts` com seus testes Vitest.

---

## TODO futuro

Quando o deploy em AWS Lambda + EventBridge for feito, cada `cli/src/*.ts` vira um handler:

```typescript
// lambda/hourlyInsights.ts (exemplo)
import { initDb } from '@vetor-wallet/server/db';
import { runHourlyInsightsJob } from '@vetor-wallet/server/services/hourlyInsights';

export const handler = async () => {
  await initDb();
  return runHourlyInsightsJob();
};
```

A migração exige `DATABASE_URL` apontando para Turso (SQLite remoto) — sem isso, Lambda não tem acesso ao arquivo local.
