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

> **Retomar aqui.** T-091c/d (dashboard de Investimentos, c1-c3+d1-d4) **concluída** (PR #234) e
> T-114 (migração AWS, passo 5 — troca `db`→`query`) **concluída** (PRs #238/#241/#244/#246/#249/#251)
> — detalhe no histórico de PRs, não repetir aqui. Fila vazia; próxima tarefa a definir com o
> humano ou puxar das Candidatas abaixo.

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
- **Resto do passo 5 da migração AWS (T-114 concluiu só os candidatos já no formato-alvo)**: `auth-core`/`insights-core`/`bank-import-core` ainda usam `db` singleton (precisam de formato + `query` juntos, não só facade) e `expenses-core.createRecurringExpenseEntry`/`materializeRecurringExpenses` ficam em `db`/transação até o Postgres estar no ar (CTE testado 2x, não roda em SQLite — ver `TODO-HUMANO.md`).
- **3 débitos da T-091d4** (achados do revisor, não-bloqueantes): `RendaFixaPage` ainda calcula o total de RF por conta própria em vez de reaproveitar `consolidateFixedIncome` (3ª implementação do mesmo conceito, mas essa página não combina manual+Pluggy então o risco de divergência é menor); o card "Investimentos" da Home mostra só Ações enquanto o hero já inclui RF (escopo de exibição, decisão de produto se quiser igualar); RF manual falhando tira a RF inteira do patrimônio, inclusive a parte da Pluggy que pode estar OK (design conservador documentado e testado, não bug).
- Casing da API inconsistente; default silencioso `type: 'OUTRO'` no POST /api/income; ampliar `/admin`; backend de cripto; redesign de Alertas/Import (sem UI desde a T-026).

## Histórico

Ciclos concluídos: tabela em [`README.md`](./README.md) § "Ciclos concluídos". Detalhe de cada
tarefa: PRs no GitHub e `git log`. Calibragem de modelos: `CALIBRAGEM.md`.
