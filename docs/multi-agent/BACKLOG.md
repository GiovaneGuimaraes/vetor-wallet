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

### T-091 — Metas sai, Investimentos entra como árvore (guarda-chuva) ⭐ PRÓXIMA
- **Status**: PENDENTE · **Complexidade**: alta (executor Opus) · **Depende de**: nada
- **Objetivo**: decisão do humano (2026-08-13) — **remover o layer de Metas** e criar **Investimentos** como pai de **Ações**, **Cripto** e **Renda Fixa**. Hoje Ações assume ticker da B3 + preço médio + cotação da brapi, e "Aplicação RDB"/caixinha não tem nenhum dos três.
- **Caixinhas são Renda Fixa, IRMÃS de Ações — não dentro dela.** Proposto contra o pedido original ("dentro de Ações") e **aprovado pelo humano em 2026-08-13 — não reabrir**. A proximidade visual é mantida (irmãs no mesmo pai), mas renda fixa *dentro* de Ações recriaria o acoplamento que esta tarefa desfaz. Caixinha não é apelido de poupança: no Nubank é lastreada em RDB e rende % do CDI, e o padrão não é exclusivo dele (cofrinho no PicPay/Inter, objetivos no C6).
- **Fases, em série**: **(a)** árvore + navegação, sem dado novo (Cripto já existe como "em breve"); **(b)** remover Metas — ver abaixo; **(c)** posição sem ticker (renda fixa/caixinha manual: valor aplicado, vencimento, taxa); **(d)** endpoint `/investments` da Pluggy para preencher.
- **Remover Metas é migração destrutiva, não deleção de UI**: arrasta `goals`, `savings_entries.goal_id`, o **par atômico** de transferência poupança → meta (T-041), `CRUD /api/goals`, `POST /savings/transfer-to-goal`, card da Home e `computeGoalsSummary`. Fazer em duas etapas — sumir da UI primeiro, dropar dado depois, com o humano confirmando entre elas. Na T-089g o layer já saiu **só da vitrine** (landing), sem tocar dado.
- **Caixinha como sucessora de Metas**: pendência do humano, em `TODO-HUMANO.md` — decide o desenho da fase (b).
- **Risco de dupla contagem com a T-089e**: o dinheiro na caixinha **saiu** da conta corrente, então saldo de conta + posição de caixinha não se sobrepõem — mas se a Pluggy devolver a caixinha *também* como conta, soma duas vezes. Conferir contra o payload real antes de somar.
- **Aceite (por fase)**: carteira B3 segue intacta e com os mesmos números; nada de Metas é apagado sem confirmação explícita; suítes verdes.

### T-104 — Migrar os `*-core` restantes para o formato-alvo (guarda-chuva)
- **Status**: PENDENTE · **Complexidade**: alta (executor Opus) · **Depende de**: T-103
- **Objetivo**: o alvo (provado no `subscription-core`, generalizado no `validation-core`) é **1 função por arquivo**, **`db` injetado**, testes em `tests/unit/tests/`, **cobertura 100%**, Jest. Uma tarefa/PR por package, **em série** — cada um arrasta call sites e mexe nos mesmos arquivos de config. Ordem e quem já migrou: tabela no `docs/PACKAGES.md`. Próxima: **`savings-core`**, o primeiro core **com `db`**.
- **Atenção na `savings-core`**: invariantes intocáveis — par atômico da transferência poupança → meta (T-041) e saldo livre em centavos inteiros (T-052). **Conflita com a T-091(b)**, que remove Metas e mexe nas mesmas funções: fazer as duas em série, nunca em paralelo. Achado da T-104a: separar funções expõe branches de default antes cobertos por acidente — rodar `--coverage` cedo.
- **Fora de escopo**: mudar regra de negócio; desfazer acoplamentos core→core (ver Candidatas).
- **Aceite (por package)**: suíte do package verde com cobertura 100%; `build`, `lint`, `format:check` e `pnpm test` da raiz verdes; contagem de testes do `rest-api` preservada ou maior.

### T-089e — Patrimônio total com saldo das contas da Pluggy
- **Status**: PENDENTE · **Complexidade**: média · **Depende de**: T-089 (concluída, #163)
- **Objetivo**: pedido do humano (2026-08-12) — o card de patrimônio da Home deve somar o dinheiro que está **na conta e na poupança do banco**. Hoje é `ações + poupança do app`.
- **Decisão travada**: saldo é **posição**, não lançamento — gravá-lo faria a poupança **contar duas vezes** (o aporte já registrado + o saldo que o inclui). Ler e exibir, **nunca gravar** em `savings_entries`. `toPluggyAccount` descarta `balance` hoje (deliberado na T-087) e precisa voltar a trazê-lo.
- **Cuidado**: saldo de cartão (`CREDIT`) é **dívida**, não patrimônio — só `BANK` entra. Ver também o risco de dupla contagem com caixinhas, na T-091.
- **Aceite**: patrimônio soma as contas `BANK` conectadas; sem conexão nada muda; nada novo é gravado; suítes verdes.

### T-092 — Teste de render de componente no web
- **Status**: PENDENTE · **Complexidade**: média · **Depende de**: nada
- **Objetivo**: promovida das Candidatas (revisores da T-076 e T-101) porque a T-089c tornou o buraco concreto: o `PluggyImportModal` é o componente mais complexo do app — modo destrutivo, confirmação por digitação — e **nada prova que ele chama a lógica pura já testada**. Um `disabled` invertido no botão de replace passa verde hoje.
- **Escopo**: Testing Library no runner que já existe (Vitest + jsdom), cobrindo primeiro o `PluggyImportModal`: botão travado sem `APAGAR`, aviso presente, relatório renderizado. O padrão fica documentado no `CLAUDE.md` do web.

## Candidatas (débito latente — não urgente, o orquestrador puxa daqui)

- **Acoplamentos core→core** (regra 6 do `PACKAGES.md`; pré-existentes): `auth-core → portfolio-core` e `insights-core → portfolio-core` — a saída é a **rota** orquestrar. E `portfolio-core/snapshots.ts` tem um **segundo client da brapi** (`fetchQuotesStrict`, que lança) paralelo ao `brapi-core.fetchQuotes` (que degrada em silêncio) — unificar.
- **Limpar backend de budgets** (rotas + `category_budgets` + tipo no shared): sem UI, nada consome.
- **`buildIbovespaSeries` em UTC** enquanto a rota ancora em BRT — candle após 21h BRT pode ser datado como "amanhã" e recortado (T-095).
- **Glob do Prettier não alcança a raiz dos packages** — `rest-api/vitest.config.ts` fora do padrão, CI não detecta (T-105).
- **Três origens de mascote no web** (`mascots.ts`, `AuthPage.tsx`, `HomePage.tsx`); só a primeira foi unificada na T-020.
- **Movimentação interna no OFX** (T-085/T-088): sem campo de categoria, só `MEMO` livre — adivinhar por descrição é o que a T-085 recusa fazer com dinheiro.
- **Backfill histórico de snapshots** via `hourly_quote_insights`; agendador do job de insights (Lambda/EventBridge — o da T-061 morre com o processo).
- **Webhook da Pluggy** (`item/*`) daria o `itemId` e o gatilho de sync, mas exige HTTPS público — depende de deploy (spec em `pluggy-core/CLAUDE.md`).
- Casing da API inconsistente (`target_amount` × camelCase); default silencioso `type: 'OUTRO'` no POST /api/income; ampliar `/admin`; backend de cripto; redesign de Alertas/Import (sem UI desde a T-026).

## Histórico

Ciclos concluídos: tabela em [`README.md`](./README.md) § "Ciclos concluídos". Detalhe de cada
tarefa: PRs no GitHub e `git log`. Calibragem de modelos: `CALIBRAGEM.md`.
