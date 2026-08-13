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

### T-089e — Patrimônio total com saldo das contas da Pluggy
- **Status**: PENDENTE · **Complexidade**: média · **Depende de**: T-089 (concluída, #163)
- **Objetivo**: pedido do humano (2026-08-12) — o card de patrimônio da Home deve somar o dinheiro que está **na conta corrente e na poupança do banco**. Hoje ele é `ações + poupança do app`.
- **A decisão travada**: saldo é **posição** (foto de agora), não lançamento. O app modela poupança como série de aportes; gravar saldo como lançamento faria a poupança **contar duas vezes** (o aporte já registrado + o saldo que o inclui). Então: ler e exibir, **nunca gravar** em `savings_entries`.
- **`toPluggyAccount` descarta `balance` hoje** (T-087, deliberado) — precisa voltar a trazê-lo, e `PluggyAccount` ganha o campo.
- **Cuidado**: saldo de cartão (`CREDIT`) é **dívida**, não patrimônio — somá-lo inflaria o número. Só `BANK` entra.
- **Aceite**: patrimônio da Home soma saldo das contas `BANK` conectadas; sem conexão, o número é o de hoje (nada quebra); nada novo é gravado no banco; suítes verdes.

### T-091 — Layer de Ações vira Investimentos, como árvore (guarda-chuva)
- **Status**: PENDENTE · **Complexidade**: alta (executor Opus) · **Depende de**: T-089e
- **Objetivo**: decisão do humano (2026-08-12) — o layer de Ações vira **Investimentos**, com **sub-layers**: um de Cripto e outro de Ações/outros (renda fixa incluída). Hoje o layer assume ticker da B3 + preço médio + cotação da brapi, e "Aplicação RDB" não tem ticker nem cotação.
- **Fases, em série**: **(a)** modelo + navegação — Investimentos como pai, Cripto e Ações/Outros como filhos, sem dado novo (o card de Cripto já existe como "em breve"); **(b)** posição sem ticker (renda fixa manual: valor aplicado, vencimento, taxa); **(c)** endpoint `/investments` da Pluggy para preencher.
- **Por que (c) é fase e não atalho**: a `category: Investments` das transações (T-088) só marca **movimento de caixa** — aplicação e resgate. Posição (o que você *tem*) só vem do endpoint `/investments`. Um não substitui o outro.
- **Aceite (por fase)**: carteira B3 existente segue intacta e com os mesmos números; suítes verdes.

### T-092 — Teste de render de componente no web
- **Status**: PENDENTE · **Complexidade**: média · **Depende de**: nada
- **Objetivo**: promovida das Candidatas (sugerida pelos revisores da T-076 e T-101) porque a T-089c tornou o buraco concreto: o `PluggyImportModal` é o componente mais complexo do app — modo destrutivo, confirmação por digitação, estados de erro — e **nenhum teste prova que o componente chama a lógica pura já testada**. Um `disabled` invertido no botão de replace passa verde hoje.
- **Escopo**: subir Testing Library no runner que já existe (Vitest + jsdom), e cobrir primeiro o `PluggyImportModal`: botão destrutivo travado sem `APAGAR`, aviso presente, relatório renderizado.
- **Aceite**: o modal tem teste de render; o padrão fica documentado no `CLAUDE.md` do web para os próximos.

## Candidatas (débito latente — não urgente, o orquestrador puxa daqui)

- **Acoplamentos core→core** (violam a regra 6 do `PACKAGES.md`; pré-existentes, tornados visíveis pela extração): `auth-core → portfolio-core` e `insights-core → portfolio-core` — a saída é a **rota** orquestrar os dois módulos. E `portfolio-core/snapshots.ts` tem um **segundo client da brapi** (`fetchQuotesStrict`, que lança) paralelo ao `brapi-core.fetchQuotes` (que degrada em silêncio) — unificar no `brapi-core`.
- **Limpar backend de budgets** (rotas + tabela `category_budgets` + tipo no shared): a UI saiu na T-089 e nada mais consome.
- **`buildIbovespaSeries` data em UTC** enquanto a rota ancora em BRT — candle após 21h BRT pode ser datado como "amanhã" e recortado (achado da T-095).
- **Glob do Prettier não alcança a raiz dos packages** — `packages/rest-api/vitest.config.ts` segue fora do padrão e o CI não detecta (achado da T-105).
- **Três origens de mascote no web** montam `/layers/<arquivo>` com mapas próprios (`mascots.ts`, `AuthPage.tsx`, `HomePage.tsx`); só a primeira foi unificada na T-020.
- **Movimentação interna no OFX** segue pendente (T-085/T-088): sem campo de categoria, só `MEMO` livre — adivinhar por descrição é o que a T-085 recusa fazer com campo de dinheiro.
- **Backfill histórico de snapshots** via `hourly_quote_insights`; agendador do job de insights (Lambda/EventBridge — o da T-061 é in-process e morre com o processo).
- Endpoint `investments` da Pluggy p/ reconciliar posição B3; **webhook da Pluggy** (`item/*`) daria o `itemId` e o gatilho de sync, mas exige HTTPS público — depende de deploy (spec em `pluggy-core/CLAUDE.md`).
- Casing da API inconsistente (`target_amount` × camelCase); default silencioso `type: 'OUTRO'` no POST /api/income; ampliar `/admin`; backend de cripto; redesign de Alertas/Import (sem UI desde a T-026).

## Histórico

Ciclos concluídos: tabela em [`README.md`](./README.md) § "Ciclos concluídos". Detalhe de cada
tarefa: PRs no GitHub e `git log`. Calibragem de modelos: `CALIBRAGEM.md`.
