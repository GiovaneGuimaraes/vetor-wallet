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

> **Retomar aqui.** **T-104 CONCLUÍDA em 2026-10-16** — passo 3 da migração fechado: todos os
> cores vivos no formato-alvo (PRs #196/#201/#205/#207/#209). Só falta `budgets`, que não migra
> — é candidata à remoção, não ao formato (ver Candidatas). Achado final (portfolio-core,
> PR #209): o scheduler `setInterval` não existe mais (saiu na T-109b); o único gatilho de
> coleta é `catchUpIfNeeded()` no boot, verificado 2x com o server compilado de verdade.
> T-113 concluída (PR #195): achado reusável foi o adaptador `createSqliteQuery`
> (`packages/rest-api/src/api/sqliteQuery.ts`) — só usar se um core for direto para `query`.
> Passo 4 provado em 2026-09-22 contra Postgres real; passos 6–8 parados por decisão do humano.
> Decisão 3 (sessão) fechada: store vai para Postgres na fase 2, não JWT no gateway.

### T-091c/d — Investimentos como dashboard real (guarda-chuva, spike concluído 2026-10-16)
- **Status**: EM_ANDAMENTO · fatia c2 (página Renda Fixa no web) · **Complexidade**: alta · **Depende de**: T-091a (#165) e b1 (#166)
- **Escopo**: página de Investimentos vira dashboard com dado real, pra quem lança na mão E pra quem integrou a Pluggy — Ações (já existe, **não mexer nos números**) + Renda Fixa (hoje só placeholder). IA fica para depois.
- **c1 CONCLUÍDA (PR #214)**: `fixed-income-core` + `/api/fixed-income` (CRUD, isolamento por usuário testado). Desvio documentado: `rate` é `DOUBLE PRECISION` no Postgres (não `NUMERIC`) porque a rota não limita casas decimais dela.
- **Roadmap**: **c2** (em andamento) página RF no web, consumindo `/api/fixed-income` · **c3** hub vira dashboard (resolve "herdado da (a)": valor por `node.key`) · **d1** `pluggy-core` lê `/investments` + CLI de diagnóstico · **d2** RF lê Pluggy ao vivo, sem gravar · **d3** vínculo manual↔Pluggy · **d4** RF no patrimônio da Home (depende da T-089e — não rodar d1 e T-089e em paralelo).
- **Pendências não-bloqueantes** (ver `TODO-HUMANO.md`, travam d2/d4, não c2/c3): gravar ou não a posição da Pluggy, RF no patrimônio, ações de outras corretoras via Pluggy, caixinha já lançada em Poupança.
- **Aceite (geral)**: carteira B3 com os mesmos números em todo lugar; cada fatia com suíte verde e PR própria.

### T-089e — Patrimônio total com saldo das contas da Pluggy
- **Status**: PENDENTE · **Complexidade**: média · **Depende de**: T-089 (#163)
- **Objetivo**: pedido do humano (2026-08-12) — o card de patrimônio da Home deve somar o dinheiro que está **na conta e na poupança do banco**. Hoje é `ações + poupança do app`.
- **Decisão travada**: saldo é **posição**, não lançamento — gravá-lo faria a poupança **contar duas vezes**. Ler e exibir, **nunca gravar** em `savings_entries`. `toPluggyAccount` descarta `balance` hoje (deliberado na T-087) e precisa voltar a trazê-lo.
- **Cuidado**: saldo de cartão (`CREDIT`) é **dívida** — só `BANK` entra. Ver a dupla contagem com caixinhas na T-091.
- **Aceite**: patrimônio soma as contas `BANK` conectadas; sem conexão nada muda; nada novo é gravado; suítes verdes.

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
- Casing da API inconsistente; default silencioso `type: 'OUTRO'` no POST /api/income; ampliar `/admin`; backend de cripto; redesign de Alertas/Import (sem UI desde a T-026).

## Histórico

Ciclos concluídos: tabela em [`README.md`](./README.md) § "Ciclos concluídos". Detalhe de cada
tarefa: PRs no GitHub e `git log`. Calibragem de modelos: `CALIBRAGEM.md`.
