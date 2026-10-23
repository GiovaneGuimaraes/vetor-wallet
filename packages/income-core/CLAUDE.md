# CLAUDE.md — @vetor-wallet/income-core

Dono das tabelas `income_sources` (fontes fixas mensais, sem data) e
`income_entries` (lançamentos avulsos datados, T-036). Categoria **Core**,
módulo **Income** (ver `docs/MODULES.md`/`docs/PACKAGES.md`).

Nasceu na **T-110d** (2026-09-20), extraído das rotas
`packages/rest-api/src/api/routes/{income,incomeEntries}.ts`.

**T-114 (2026-10-23, passo 5 de `docs/multi-agent/plano-migracao-aws.md`): o
`db` do libSQL saiu.** Toda função aqui recebe `query: Query`
(`@vetor-wallet/query`) em vez de `db: Db`, com `{ text, values }` e
placeholders `$1, $2, ...` (convenção Postgres), `RETURNING id` no lugar de
`lastInsertRowid`, `rowCount` no lugar de `rowsAffected`. Molde seguido à
risca de `alerts-core` e `subscription-core` (as duas fatias mais recentes
desta mesma migração). O `rest-api` **continua em SQLite** — as rotas injetam
`createSqliteQuery(db)` (`packages/rest-api/src/api/sqliteQuery.ts`), um
adaptador que traduz `$N` para `?` e devolve o `Db` de sempre por baixo.
Nenhuma linha deste package sabe disso; quando o Postgres entrar de verdade,
a rota troca para `createPgQuery(...)` sem tocar este core.

## Por que este package existe, se o `MODULES.md` dizia que não existiria

O `MODULES.md` registrava: *"Este módulo não tem package core e provavelmente
não vai ter: a lógica é CRUD com validação, sem regra de negócio própria."*
Isso continua **verdade sobre as regras** — e mesmo assim o package nasceu,
porque o critério mudou.

O critério antigo era "tem regra de negócio?". O novo é **"onde mora o SQL
quando ele precisar ser reescrito?"**: o passo 3 da migração
(`docs/multi-agent/plano-migracao-aws.md`) tira o SQL das rotas para que a
tradução SQLite → Postgres tenha **um lugar por query** em vez de 29 pontos
espalhados em duas rotas do Express. Um core magro é o preço; encontrar `substr`
sobre coluna de data no meio de um handler HTTP, meses depois, seria mais caro.

## Invariantes (não quebrar)

- **Toda consulta filtra por `user_id`** — inclusive o re-SELECT depois do
  INSERT (T-059) e o `UPDATE` depois da checagem de existência (T-051), não só
  a checagem. Nem uma corrida entre as duas consultas pode escrever em linha
  alheia.
- **Ausência é `null`/`false`, não exceção.** `updateIncome*` devolve `null` e
  `deleteIncome*` devolve `false`; a rota traduz nos 404. "Não existe" e "não é
  seu" colapsam no mesmo 404 de propósito — distinguir transformaria a rota em
  sonda de existência.
- **Editar `date` pode mover o lançamento de mês**, e isso é permitido: quem
  tira o item da lista exibida é a visão mensal do cliente.
- **O POST de `income_entries` NÃO está aqui.** Ele passa por
  `insertEntryWithExternalId` (`@vetor-wallet/bank-import-core`), porque a
  dedupe por `external_id` (T-084) é política do módulo BankImport — o mesmo
  caminho serve OFX, Pluggy e digitação manual.

## Débito herdado, preservado de propósito

`createIncomeSource` mantém o **default silencioso `type: 'OUTRO'`** quando o
corpo não manda `type`. Está listado nas Candidatas do `BACKLOG.md` desde antes
desta extração; mudar o comportamento aqui teria escondido uma mudança de API
dentro de um refactor que promete não mudar nada.

## Nota para o passo 5 da migração (Postgres)

`listIncomeEntriesByMonth` recorta o mês com `substr(date, 1, 7) = ?`, que
funciona porque `date` é **texto** `YYYY-MM-DD` no SQLite. Com coluna de data
real isso vira filtro de intervalo — mantido como está, o `substr` impediria o
índice de ser usado.

## Convenções

Formato-alvo (molde do `savings-core`, T-110a/b; `query` injetado desde a
T-114): **uma função por arquivo**, **`query` injetado** (nunca importado),
testes em `tests/unit/tests/` importando por `src/...`, **Jest**, cobertura
**100% travada por `coverageThreshold`**.
