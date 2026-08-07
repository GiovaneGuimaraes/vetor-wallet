# CLAUDE.md — @vetor-wallet/validation-core

Validações transversais do Vetor Wallet, extraídas de
`packages/server/src/api/services/{dates,money,categories}.ts` na T-099a
(Ciclo 19 — arquitetura em módulos). Categoria **Core**, **sem módulo** — é
transversal como `db` e `shared` (regra 6 de `docs/PACKAGES.md`): qualquer
`*-core` ou `rest-api` pode depender dele, e ele não depende de nenhum outro
core. Puro, sem I/O — não importa `@vetor-wallet/db`, `express` nem nada de
`server`/`web`.

## Estrutura

```
src/
├── dates.ts       # isValidIsoDate() (calendário real, T-043), parseDaysParam()
│                  # (?days= de /portfolio/history e /benchmarks/history, T-068)
├── money.ts       # isValidMoneyAmount() (máx. 2 casas decimais, T-052),
│                  # MAX_MONEY_AMOUNT + mensagens de erro (T-065)
├── categories.ts  # normalizeCategory() (T-028) — ver invariante abaixo
└── index.ts       # barrel: reexporta as três acima
```

## Invariantes (não quebrar)

- **`isValidIsoDate`/`isValidMoneyAmount`/`normalizeCategory` não têm
  implementação alternativa em lugar nenhum do backend.** `packages/db`
  (`migrations.ts`) e `packages/server` importam daqui. Antes da T-099a havia
  três cópias byte a byte idênticas (server, db, web); agora db e server
  compartilham a mesma função — só resta a duplicata do `web`, abaixo.
- **A cópia em `packages/web/src/routes/categories.ts` FICA e é esperada.**
  O navegador não consome package de backend (mesma regra de sempre — ver
  "Nota sobre helpers duplicados server ↔ web" em `docs/PACKAGES.md`). As duas
  cópias (esta e a do web) **mudam juntas**; ambas têm teste próprio.
- **`normalizeCategory` é usada em migração de dados** (`packages/db/src/migrations.ts`,
  T-028): reescreve a coluna `category` de três tabelas a cada `initDb()`. Um
  caractere de diferença entre o que grava e o que compara faz um orçamento
  voltar a exibir 0% com gastos lançados. O teste de `categories.test.ts` cobre
  o caso unicode (`toLocaleLowerCase('pt-BR')` dobra "SAÚDE"/"saúde", diferente
  do `lower()` ASCII-only do SQLite) e NFC/NFD — não altere a implementação sem
  atualizar os dois lados.
- **Este package não pode depender de `@vetor-wallet/db`** — seria ciclo, já
  que `db` depende dele para `migrations.ts`.

## Convenções

- Sem I/O, sem `Date`-lib externa, sem dependência de terceiros em runtime.
- Teste ao lado do código (`src/**/*.test.ts`), Vitest.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência) e
`docs/MODULES.md`.
