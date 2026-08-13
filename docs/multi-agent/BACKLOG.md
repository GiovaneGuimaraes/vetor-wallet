# Backlog de tarefas — escrito pelo orquestrador

> Somente o orquestrador escreve aqui (regras em `README.md`). Executores reportam no retorno do subagente.
>
> Estados: `PENDENTE` → `EM_ANDAMENTO` → (`BLOQUEADA`) → `EM_REVISAO` → `CONCLUIDA` | `CANCELADA`

## Higiene — regra dura (2026-08-09)

Este arquivo é lido em **toda** sessão do orquestrador: cada caractere é pago repetidamente.
Só **trabalho vivo** entra. Rationale completo e modelo de tarefa: [`README.md`](./README.md).

- **Tarefa concluída sai daqui** — o registro vive na PR mergeada e no git; "como o app é
  hoje" vive nos `CLAUDE.md` de package e em `docs/decisions/`.
- **Teto de 8 KB** (`pnpm backlog:check`). Estourou = tarefa concluída ou spec inflada.
- **Tarefa viva cabe em ~700 caracteres.** Post-mortem vai para a PR; o que muda roteamento
  futuro vai para `CALIBRAGEM.md`.
- **Pendência que depende do humano não é backlog** — vai para `TODO-HUMANO.md`.

---

## Fila

### T-104 — Migrar os `*-core` restantes para o formato-alvo (guarda-chuva)
- **Status**: PENDENTE · **Complexidade**: alta (executor Opus) · **Depende de**: T-103
- **Objetivo**: o alvo — provado no `subscription-core`, generalizado no `validation-core` — é **1 função por arquivo**, **`db` injetado**, testes em `tests/unit/tests/`, **cobertura 100%**, Jest. Uma tarefa/PR por package, **em série** (cada um arrasta call sites e mexe nos mesmos arquivos de config; worktrees paralelos conflitam). Ordem: ~~`validation-core` ✅~~ → **`savings-core` (próxima)** → `expenses-core` → `bank-import-core` → `auth-core` → `insights-core` → `portfolio-core`. Quem já migrou: tabela no `docs/PACKAGES.md`.
- **`savings-core`, a próxima**: primeiro core **com `db`** — a injeção sai do piloto e as rotas de savings/goals passam a receber `db` explícito. Invariantes intocáveis: transferência poupança → meta é **par atômico** (T-041); saldo livre em **centavos inteiros** (T-052). Achado da T-104a: separar funções que dividiam um arquivo expõe branches de default antes cobertos por acidente — rodar `--coverage` cedo.
- **Fora de escopo**: mudar regra de negócio; desfazer acoplamentos core→core (ver Candidatas).
- **Critério de aceite (por package)**: suíte do package verde com cobertura 100%; `pnpm build`, `lint`, `format:check` e `pnpm test` da raiz verdes; contagem de testes do `rest-api` preservada ou maior.

### T-089 — Conectar a Pluggy pelo app (botão + itemId por usuário)
- **Status**: (a)(b)(c)(d) **CONCLUIDAS** — (a) #160, (b)(c)(d) **EM_REVISAO** (implementadas 2026-08-12, aguardando PR) · **Complexidade**: alta
- **Objetivo**: decisão de 2026-08-12 — **produto multi-usuário**, cada um conecta o próprio banco por um botão. Antes da fase (a) a integração era job de terminal com o `itemId` num `.env`: uma instalação, um usuário.
- **Entregue**: `/api/pluggy/{status,connect-token,items,sync}` + `DELETE /items/:itemId` (revoga na Pluggy **antes** de apagar a linha — ao contrário, falha deixaria item órfão sem saída pela UI); botão no card de patrimônio da Home; modal com escolha append × replace; gatilho de sync na própria rota.
- **Da fase (a), para não reabrir**: `item_id` tem unicidade **global** porque é credencial *portadora* — por usuário, B importaria o extrato de A.
- **Gate `ENVIRONMENT`**: só `Staging` libera, **fail closed**; vive na **rota**, e `GET /status` é a única SEM ele — é ela que conta ao web se está ligada (gateá-la obrigaria a cópia em `VITE_*` que a decisão proíbe).
- **`replace` apaga TUDO** (renda, despesa, poupança, manuais inclusive) — decisão do humano com o risco apresentado. A poupança **não volta** (a Pluggy não a escreve); a UI exige digitar `APAGAR`.
- **Aceite**: ✅ dois usuários isolados; `Production` bloqueia (verificado no servidor real, não só em teste); 21 testes de rota; suítes verdes.

### T-089e — Patrimônio total com saldo das contas da Pluggy
- **Status**: PENDENTE · **Complexidade**: média · **Depende de**: T-089 (b)(c)(d)
- **Objetivo**: pedido do humano (2026-08-12) — o card de patrimônio da Home deve somar o dinheiro que está **na conta** e na poupança do banco. Hoje ele é `ações + poupança do app`.
- **A decisão que falta**: saldo é **posição** (foto de agora), não lançamento — o app modela poupança como série de aportes. Gravar saldo como lançamento faria a poupança contar duas vezes (o aporte já registrado + o saldo que o inclui). Provável saída: exibir como posição lida da Pluggy, sem gravar.
- **`toPluggyAccount` descarta `balance` hoje** (T-087, deliberado) — precisa voltar a trazê-lo.

## Candidatas (débito latente — não urgente, o orquestrador puxa daqui)

- **Layer de Ações → Investimentos, como ÁRVORE** (decisão do humano, 2026-08-12): generalizar para abrigar renda fixa, que não tem ticker da B3 nem cotação da brapi, com **sub-layers** — um de Cripto e outro de Ações/outros investimentos. É o destino do caso `Investments` da T-088. Refatoração de modelo, não ajuste de importador. **Nota da T-089**: preencher isso com dado da Pluggy exige o endpoint `/investments` (devolve **posição**); a `category` das transações só marca movimento de caixa (aplicação/resgate) e não constrói carteira.

- **Acoplamentos core→core** (violam a regra 6 do `PACKAGES.md`; pré-existentes, tornados visíveis pela extração): `auth-core → portfolio-core` e `insights-core → portfolio-core` — a saída é a **rota** orquestrar os dois módulos. E `portfolio-core/snapshots.ts` tem um **segundo client da brapi** (`fetchQuotesStrict`, que lança) paralelo ao `brapi-core.fetchQuotes` (que degrada em silêncio) — unificar no `brapi-core`.
- **Limpar backend de budgets** (rotas + tabela `category_budgets` + tipo no shared): a UI saiu na T-089 e nada mais consome.
- **`buildIbovespaSeries` data em UTC** enquanto a rota ancora em BRT — candle após 21h BRT pode ser datado como "amanhã" e recortado (achado da T-095).
- **Glob do Prettier não alcança a raiz dos packages** — `packages/rest-api/vitest.config.ts` segue fora do padrão e o CI não detecta (achado da T-105).
- **Três origens de mascote no web** montam `/layers/<arquivo>` com mapas próprios (`mascots.ts`, `AuthPage.tsx`, `HomePage.tsx`); só a primeira foi unificada na T-020.
- **Nenhum teste de render de componente existe no `web`** — funções puras provam a decisão, não que o componente a chama (sugestão repetida pelos revisores da T-076 e T-101).
- **Backfill histórico de snapshots** via `hourly_quote_insights`; agendador do job de insights (Lambda/EventBridge — o da T-061 é in-process e morre com o processo).
- Endpoint `investments` da Pluggy p/ reconciliar posição B3; **webhook da Pluggy** (`item/*`) daria o `itemId` e o gatilho de sync, mas exige HTTPS público — depende de deploy (spec em `pluggy-core/CLAUDE.md`).
- Casing da API inconsistente (`target_amount` × camelCase); default silencioso `type: 'OUTRO'` no POST /api/income; ampliar `/admin`; backend de cripto; redesign de Alertas/Import (sem UI desde a T-026).

## Histórico

Ciclos concluídos: tabela em [`README.md`](./README.md) § "Ciclos concluídos". Detalhe de cada
tarefa: PRs no GitHub e `git log`. Calibragem de modelos: `CALIBRAGEM.md`.
