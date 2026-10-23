# Backlog de tarefas — escrito pelo orquestrador

> Somente o orquestrador escreve aqui (regras em `README.md`). Executores reportam no retorno do subagente.
>
> Estados: `PENDENTE` → `EM_ANDAMENTO` → (`BLOQUEADA`) → `EM_REVISAO` → `CONCLUIDA` | `CANCELADA`

## Higiene — regra dura (2026-08-09)

Este arquivo é lido em **toda** sessão do orquestrador: cada caractere é pago repetidamente.
Só **trabalho vivo** entra. Rationale completo e modelo de tarefa: [`README.md`](./README.md).

- **Tarefa concluída sai daqui** — o registro vive na PR mergeada e no git; "como o app é hoje" vive nos `CLAUDE.md` de package e em `docs/decisions/`.
- **Teto de 8 KB** (`pnpm backlog:check`). Estourou = tarefa concluída ou spec inflada.
- **Tarefa viva cabe em ~700 caracteres.** Post-mortem vai para a PR; o que muda roteamento futuro vai para `CALIBRAGEM.md`.
- **Pendência que depende do humano não é backlog** — vai para `TODO-HUMANO.md`.

---

## Fila

> **Retomar aqui.** T-091c/d (dashboard de Investimentos, c1-c3+d1-d4) **concluída** (PR #234) —
> detalhe no histórico de PRs, não repetir aqui. Foco atual: T-114 (migração AWS, passo 5).

### T-114 — Trocar a facade `db` por `query` nos `*-core` (migração AWS, passo 5 do plano)
- **Status**: EM_ANDAMENTO · **`alerts-core` + `subscription-core` + `income-core` + `operations-core` CONCLUÍDAS** (PRs #238/#241/#244/#246, sem achados bloqueantes) · próxima: `expenses-core` · **Complexidade**: alta (risco silencioso documentado) · **Depende de**: T-112 (`query` existe) e T-104/T-113 (formato-alvo)
- **Escopo**: `docs/multi-agent/plano-migracao-aws.md` §5.4 passo 5 — cada `*-core` **já no formato-alvo** (db injetado por parâmetro, não singleton) troca `{ sql, args }`/`?`/`lastInsertRowid` por `{ text, values }`/`$N`/`RETURNING id`, recebendo `query: Query` em vez de `db`. **Molde provado 6x**: inclui também `tsconfig.json`/`jest.config.ts` (paths/references/moduleNameMapper de `../db` para `../query`), não só os `.ts` de lógica. Rota que cruza um core migrado com outro ainda não migrado (ex. `portfolio.ts`) fica com os dois clients lado a lado — confirmado inofensivo (adaptadores finos sobre o mesmo `db.execute`). Em SQLite ainda (via `createSqliteQuery`) — troca de facade, não de banco. Um package por PR.
- **Dívida conhecida, aceita pelo humano (ver `TODO-HUMANO.md`)**: `@vetor-wallet/query` não tem transação — `subscription-core.markChargePaidAndActivate` perdeu o `db.batch` atômico. Mesmo problema vai aparecer em `expenses-core.createRecurringExpenseEntry` — documentar do mesmo jeito, não bloquear.
- **Ordem restante, só candidatos JÁ no formato-alvo**: `expenses-core` (10 arquivos, tem a função com múltiplas escritas acima) → `portfolio-core` (10, única rota ainda vai misturar `db`/`query` nela mesma até terminar).
- **Ficam de fora por ora, precisam de fatia própria (formato + query, não só query)**: `auth-core` (`service.ts`/`cognitoMirror.ts` importam `db` singleton, nem 1-função-por-arquivo); `insights-core` (`benchmarks.ts`, 3 funções num arquivo só, `db` singleton); `bank-import-core` (misto — `linkPluggyItem`/`listPluggyItems`/`unlinkPluggyItem`/`syncPluggyItems` já injetam `db`, mas `externalId.ts`/`ofx.ts`/`pluggy.ts` usam o singleton de propósito, decisão registrada no `CLAUDE.md` do package como "divergência consciente... unificação é de tarefa própria").
- **Armadilha documentada (não pular)**: `isUniqueViolation` por `SQLITE_CONSTRAINT_UNIQUE` vira SQLSTATE `23505` — se passar despercebido, dedupe de importação e corrida de recorrência **param de funcionar em silêncio** e viram 500. Teste isso primeiro em cada fatia que tocar dedupe/unique.
- **Fora de escopo**: rotas com SQL ainda não extraído pra core (`budgets`, `plans`, `import`, `recurringExpenses`, `billingSimulate`, `webhooks`) — ficam pendentes de uma extração própria antes de poderem trocar de facade; não é esta tarefa.
- **Aceite (por fatia)**: package usa `query: Query` injetado, SQL em `$N`/`RETURNING id`, suíte do package + `rest-api` (rota que o consome, adaptada pra passar `createSqliteQuery(db)`) verdes, cobertura 100% onde já era exigida.

## Candidatas (débito latente — não urgente, o orquestrador puxa daqui)

- **Acoplamentos core→core** (regra 6 do `PACKAGES.md`; pré-existentes): `auth-core → portfolio-core` e `insights-core → portfolio-core` — a saída é a **rota** orquestrar. E `portfolio-core/snapshots.ts` tem um **segundo client da brapi** (`fetchQuotesStrict`, que lança) paralelo ao `brapi-core.fetchQuotes` (que degrada em silêncio) — unificar.
- **Fundir `operations-core` de volta no `portfolio-core`** (sugerido pelo executor da T-104/PR #209): o motivo de terem ficado separados (barrel do `portfolio-core` abria o banco no import) não existe mais desde que o formato-alvo chegou lá. Mudança de fronteira, não de formato — mexe em 7 funções + testes + imports de 3 rotas.
- **Limpar backend de budgets** (rotas + `category_budgets` + tipo no shared): sem UI, nada consome.
- **`buildIbovespaSeries` em UTC** enquanto a rota ancora em BRT — candle após 21h BRT pode ser datado como "amanhã" e recortado (T-095).
- **Glob do Prettier não alcança a raiz dos packages** — `rest-api/vitest.config.ts` fora do padrão, CI não detecta (T-105).
- **Três origens de mascote no web** (`mascots.ts`, `AuthPage.tsx`, `HomePage.tsx`); só a primeira foi unificada na T-020.
- **Movimentação interna no OFX** (T-085/T-088): só `MEMO` livre, sem categoria — adivinhar por descrição é o que a T-085 recusa fazer com dinheiro.
- **Backfill histórico de snapshots**: a fonte que a candidata citava (`hourly_quote_insights`) deixou de ser alimentada na T-109a — a tabela existe e está parada.
- **O `DROP` do dado morto ficou mais barato** (T-112): `users.password_hash` e `hourly_quote_insights` **não existem** nos modelos do `postgresdb`, então a migração já os deixa para trás. O dump antes da carga continua obrigatório — "não criar no destino" não é "não ter tido". Enquanto a migração não acontece, segue valendo o item abaixo.
- **Dado morto no schema, à espera de um `DROP`** (migração destrutiva: tarefa própria, com dump para fora do repo antes): `users.password_hash` desde a T-106 (guarda hash de senha antiga sem serventia) e a tabela `hourly_quote_insights` desde a T-109a (ninguém escreve; ninguém nunca leu). Juntar as duas numa migração só.
- **Webhook da Pluggy** (`item/*`) daria o `itemId` e o gatilho de sync, mas exige HTTPS público — depende de deploy (spec em `pluggy-core/CLAUDE.md`).
- **Agente de insights ações/cripto** (decisão em `TODO-HUMANO.md`, 2026-10-15): informativo, não consultivo (CVM); função > LLM onde der; MCP depois. Depende da fase 3 AWS.
- **3 débitos da T-091d4** (achados do revisor, não-bloqueantes): `RendaFixaPage` ainda calcula o total de RF por conta própria em vez de reaproveitar `consolidateFixedIncome` (3ª implementação do mesmo conceito, mas essa página não combina manual+Pluggy então o risco de divergência é menor); o card "Investimentos" da Home mostra só Ações enquanto o hero já inclui RF (escopo de exibição, decisão de produto se quiser igualar); RF manual falhando tira a RF inteira do patrimônio, inclusive a parte da Pluggy que pode estar OK (design conservador documentado e testado, não bug).
- Casing da API inconsistente; default silencioso `type: 'OUTRO'` no POST /api/income; ampliar `/admin`; backend de cripto; redesign de Alertas/Import (sem UI desde a T-026).

## Histórico

Ciclos concluídos: tabela em [`README.md`](./README.md) § "Ciclos concluídos". Detalhe de cada
tarefa: PRs no GitHub e `git log`. Calibragem de modelos: `CALIBRAGEM.md`.
