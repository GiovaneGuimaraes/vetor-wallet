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

> **Retomar aqui.** Fase 1 da migração AWS (T-104/T-113) **concluída** — detalhe no histórico de
> PRs, não repetir aqui. Foco atual: T-091c/d (dashboard de Investimentos).

### T-091c/d — Investimentos como dashboard real (guarda-chuva, spike concluído 2026-10-16)
- **Status**: EM_ANDAMENTO · **manual (c1-c3) + d1 + d2 + d3 CONCLUÍDOS** (PRs #214/#216/#218/#221/#224/#227/#229) · próxima: d4 · **Complexidade**: alta · **Depende de**: T-091a (#165) e b1 (#166)
- **Escopo**: página de Investimentos vira dashboard com dado real, pra quem lança na mão E pra quem integrou a Pluggy. IA fica para depois.
- **Entregue**: `fixed-income-core` + `/api/fixed-income` (c1); página real de Renda Fixa no web (c2); hub `/investimentos` virou dashboard (c3); `pluggy-core` lê `/investments` + CLI de diagnóstico (d1); RF da Pluggy somada à manual, ao vivo, nunca gravada (d2); vínculo explícito manual↔Pluggy (ponteiro `superseded_by_pluggy_investment_id`, sem pré-seleção, posição coberta sai do total só com investimento presente e com saldo, órfão volta a contar com aviso) — d3a+d3b, sem achados bloqueantes.
- **Roadmap restante**: **d4** (última fatia) RF no patrimônio da Home. T-089e (PR #232) concluída: patrimônio já soma conta/poupança `BANK` da Pluggy, ao vivo, nunca gravado — d4 pode rodar agora.
- **Pendências não-bloqueantes** (ver `TODO-HUMANO.md`, travam só d4): RF no patrimônio, ações de outras corretoras via Pluggy, caixinha já lançada em Poupança.
- **Aceite (geral)**: carteira B3 com os mesmos números em todo lugar; cada fatia com suíte verde e PR própria.

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
- **`InvestimentosPage` deriva o total manual de RF por `summary.totalCurrent - coveredManualCents`** em vez de usar `manualCentsCounted` direto (achado do revisor da d3b, não-bloqueante): hoje é matematicamente idêntico porque a rota calcula os dois do mesmo array, mas é um invariante implícito entre dois arquivos — quebra em silêncio se um dia `summary`/`positions` pararem de vir da mesma fonte (paginação, cache).
- Casing da API inconsistente; default silencioso `type: 'OUTRO'` no POST /api/income; ampliar `/admin`; backend de cripto; redesign de Alertas/Import (sem UI desde a T-026).

## Histórico

Ciclos concluídos: tabela em [`README.md`](./README.md) § "Ciclos concluídos". Detalhe de cada
tarefa: PRs no GitHub e `git log`. Calibragem de modelos: `CALIBRAGEM.md`.
