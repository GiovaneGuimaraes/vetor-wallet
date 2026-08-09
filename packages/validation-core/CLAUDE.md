# CLAUDE.md — @vetor-wallet/validation-core

Validações transversais do Vetor Wallet, extraídas de
`packages/server/src/api/services/{dates,money,categories}.ts` na T-099a
(Ciclo 19 — arquitetura em módulos). Categoria **Core**, **sem módulo** — é
transversal como `db` e `shared` (regra 6 de `docs/PACKAGES.md`): qualquer
`*-core` ou `rest-api` pode depender dele, e ele não depende de nenhum outro
core. Puro, sem I/O — não importa `@vetor-wallet/db`, `express` nem nada de
`server`/`web`.

## Formato-alvo (T-104a, Ciclo 20)

Migrado para o formato do `subscription-core` (T-103) — o `validation-core`
foi escolhido de propósito como **calibre**: é o package trivial da fila,
puro e sem `db` para injetar, então prova o formato antes dos cores pesados.

```
src/
├── index.ts               # barrel: exports nomeados explícitos
├── isValidIsoDate.ts       # calendário real (T-043)
├── parseDaysParam.ts       # ?days= de /portfolio/history e /benchmarks/history (T-068)
├── MAX_MONEY_AMOUNT.ts     # limite superior de valor monetário (T-065)
├── isValidMoneyAmount.ts   # máx. 2 casas decimais (T-052)
├── moneyDecimalsError.ts   # mensagem — casas decimais
├── moneyRangeError.ts      # mensagem — limite máximo (T-065)
├── moneyAmountError.ts     # escolhe a mensagem certa entre as duas acima
└── normalizeCategory.ts    # T-028 — ver invariante abaixo
```

**Um arquivo por função exportada, nome do arquivo = nome da função.**
`MAX_MONEY_AMOUNT` ganhou arquivo próprio (em vez de morar dentro de
`isValidMoneyAmount.ts`, que é o único uso no `subscription-core` de uma
constante colada à função que a usa) porque aqui a constante é consumida por
**três** arquivos (`isValidMoneyAmount`, `moneyRangeError`, `moneyAmountError`)
— dar a ela um arquivo próprio evita a assimetria de "qual dos três é o
dono".

### Onde este package DIVERGE do piloto (`subscription-core`), de propósito

O `subscription-core` faz três coisas que **não fazem sentido aqui** — não
foram replicadas por imitação:

1. **`db` injetado.** Não existe: este core não tem I/O nenhum, então não há
   `db: Db` para passar nem `createMockDb()` para escrever.
2. **`setupTests.ts`.** O `subscription-core` usa para limpar env de billing
   entre casos (`BILLING_ENABLED`, `ABACATEPAY_API_KEY`...). Aqui não há
   estado global nenhum para limpar — nenhum teste depende de env ou de
   qualquer efeito colateral entre casos — então não existe
   `tests/unit/setupTests.ts`, e `jest.config.ts` não tem
   `setupFilesAfterEnv`.
3. **`moduleNameMapper` de workspace package.** O `subscription-core` mapeia
   `@vetor-wallet/db` e `@vetor-wallet/shared` para o código-fonte porque
   depende deles. Este package não depende de nenhum outro workspace package
   (nem `shared`, que só aparece num comentário) — não há alias para
   configurar, e não há risco de a suíte cair num `dist` desatualizado de
   dependência alguma.
4. **Stryker (mutation testing).** Não foi adicionado nesta migração — está
   fora do escopo da T-104a (que cobria só format + cobertura 100%
   statements/branches/functions/lines). Ver "Avaliação do formato" no
   relatório da tarefa: cobertura 100% aqui já é mais fácil de atingir com
   sentido genuíno (funções puras e pequenas) do que no `subscription-core`,
   então o valor incremental do mutation testing é menor — mas pode ser
   adicionado numa tarefa própria se algum dia a suíte parecer "verde
   raso".

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
  voltar a exibir 0% com gastos lançados. O teste de `normalizeCategory.test.ts`
  cobre o caso unicode (`toLocaleLowerCase('pt-BR')` dobra "SAÚDE"/"saúde",
  diferente do `lower()` ASCII-only do SQLite) e NFC/NFD — não altere a
  implementação sem atualizar os dois lados.
- **Este package não pode depender de `@vetor-wallet/db`** — seria ciclo, já
  que `db` depende dele para `migrations.ts`.

## Testes — Jest, fora do `src/`

```
tests/
├── tsconfig.json           # paths: src/* e tests/*
└── unit/
    ├── jest.config.ts      # rootDir = raiz do package, thresholds 100%
    └── tests/*.test.ts     # UM por arquivo de src/
```

`pnpm --filter @vetor-wallet/validation-core test`.

Regras (mesmas do `subscription-core`, ver `docs/PACKAGES.md` → "Formato de
package (alvo)"):

- **Um `*.test.ts` por arquivo de `src/`**, mesmo nome.
- **Teste fica FORA do `src/`** e importa por `src/...` (path alias).
- **Cobertura 100%** (statements/branches/functions/lines), com
  `src/index.ts` fora da conta.
- Funções com parâmetro default (`field: string = 'amount'`) exigem teste
  chamando SEM o argumento — senão o branch do default fica descoberto e o
  threshold de 100% em branches reprova (achado desta migração: ao separar
  `moneyRangeError`/`moneyAmountError` em arquivos próprios, cada um passou a
  precisar do próprio caso "sem argumento", que antes vivia coberto
  incidentalmente por outro teste do arquivo-balaio `money.ts`).

## Convenções

- Sem I/O, sem `Date`-lib externa, sem dependência de terceiros em runtime ou
  teste.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência e
"Formato de package (alvo)") e `docs/MODULES.md`.
