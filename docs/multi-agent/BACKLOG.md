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

> **Retomar aqui.** T-091c/d (dashboard de Investimentos, c1-c3+d1-d4) **concluída** (PR #234),
> T-114 (migração AWS, passo 5 — troca `db`→`query`) **concluída** (PRs #238/#241/#244/#246/#249/#251)
> e T-115 (`reset-password` diferencia código errado/vencido e senha fraca do 204 mascarado)
> **concluída** (PR #254) — detalhe no histórico de PRs, não repetir aqui. Fila vazia; próxima
> tarefa a definir com o humano ou puxar das Candidatas abaixo.
>
> **Migração AWS PAUSADA (2026-11-04, decisão 9 do plano):** SQLite em arquivo também em staging;
> sem Aurora/bastion/`packages/infra` por ora (custo fixo, só um usuário, produção incerta). Retomar
> se for abrir para mais de um usuário ou se o staging precisar rodar em Lambda.

## Candidatas (débito latente — não urgente, o orquestrador puxa daqui)

- **Fundir `operations-core` de volta no `portfolio-core`** (sugerido pelo executor da T-104/PR #209): o motivo de terem ficado separados (barrel do `portfolio-core` abria o banco no import) não existe mais desde que o formato-alvo chegou lá. Mudança de fronteira, não de formato — mexe em 7 funções + testes + imports de 3 rotas.
- **Três origens de mascote no web** (`mascots.ts`, `AuthPage.tsx`, `HomePage.tsx`); só a primeira foi unificada na T-020.
- **Movimentação interna no OFX** (T-085/T-088): só `MEMO` livre, sem categoria — adivinhar por descrição é o que a T-085 recusa fazer com dinheiro.
- **Backfill histórico de snapshots**: a fonte que a candidata citava (`hourly_quote_insights`) deixou de ser alimentada na T-109a — a tabela existe e está parada.
- **O `DROP` do dado morto ficou mais barato** (T-112): `users.password_hash` e `hourly_quote_insights` **não existem** nos modelos do `postgresdb`, então a migração já os deixa para trás. O dump antes da carga continua obrigatório — "não criar no destino" não é "não ter tido". Enquanto a migração não acontece, segue valendo o item abaixo.
- **Dado morto no schema, à espera de um `DROP`** (migração destrutiva: tarefa própria, com dump para fora do repo antes): `users.password_hash` desde a T-106 (guarda hash de senha antiga sem serventia) e a tabela `hourly_quote_insights` desde a T-109a (ninguém escreve; ninguém nunca leu). Juntar numa migração só, **com `category_budgets`** (sem uso desde a T-118, 2026-11-04; rotas já saíram — falta o DROP e limpar `normalizeExistingCategories` em `db/migrations.ts`, o modelo do `postgresdb` e `validation-money-dates.md`).
- **Webhook da Pluggy** (`item/*`) daria o `itemId` e o gatilho de sync, mas exige HTTPS público — depende de deploy (spec em `pluggy-core/CLAUDE.md`).
- **Agente de insights ações/cripto** (decisão em `TODO-HUMANO.md`, 2026-10-15): informativo, não consultivo (CVM); função > LLM onde der; MCP depois. Depende da fase 3 AWS.
- **Passo 5 da migração AWS — o que sobrou** (T-116a/b/c concluíram `auth-core`, `insights-core` e `bank-import-core` em formato-alvo + `query`, SQLite via `createSqliteQuery`): ficam em `db` por não caberem no `Query` (sem batch/transação) `wipeUserFinancialEntries`, `createRecurringExpenseEntry` e `materializeRecurringExpenses` — só mudam se o Postgres voltar (ver `TODO-HUMANO.md`).
- **3 débitos da T-091d4** (achados do revisor, não-bloqueantes): `RendaFixaPage` ainda calcula o total de RF por conta própria em vez de reaproveitar `consolidateFixedIncome` (3ª implementação do mesmo conceito, mas essa página não combina manual+Pluggy então o risco de divergência é menor); o card "Investimentos" da Home mostra só Ações enquanto o hero já inclui RF (escopo de exibição, decisão de produto se quiser igualar); RF manual falhando tira a RF inteira do patrimônio, inclusive a parte da Pluggy que pode estar OK (design conservador documentado e testado, não bug).
- **Blocos de nota no repo no lugar do Discord** (humano vai desenhar): o espelho do Discord, o `discord-guard` e o hook `SessionStart` saíram em 2026-11-04; o estado vive só em `BACKLOG.md`/`TODO-HUMANO.md`. Falta definir o formato dos blocos de nota.
- **`GET /api/benchmarks` calcula `today` em UTC** enquanto `/history` ancora em BRT (após 21h BRT, `today` já é amanhã). Mesma classe do bug da T-119. Também: teste de rota para "falha ao criar carteira não derruba o login" (`establishSession`, T-121) e `pnpm test` do rest-api com timeout de hook de 10s intermitente sob carga (`portfolio.test.ts`, `pluggy.test.ts`).
- Casing da API inconsistente; default silencioso `type: 'OUTRO'` no POST /api/income; ampliar `/admin`; backend de cripto; redesign de Alertas/Import (sem UI desde a T-026).

## Histórico

Ciclos concluídos: tabela em [`README.md`](./README.md) § "Ciclos concluídos". Detalhe de cada
tarefa: PRs no GitHub e `git log`. Calibragem de modelos: `CALIBRAGEM.md`.
