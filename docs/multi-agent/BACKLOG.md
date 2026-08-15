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

### T-091 — Metas sai, Investimentos entra como árvore (guarda-chuva)
- **Status**: (a) CONCLUIDA (#165); (b1) CONCLUIDA (#166); **(b2) BLOQUEADA** no humano; (c)/(d) PENDENTE · **Complexidade**: alta (executor Opus) · **Depende de**: nada
- **Feito**: (a) árvore `/investimentos` com Ações, Cripto e Renda Fixa (rationale de "caixinha é Renda Fixa, irmã de Ações — **não reabrir**": PR #165). (b1) Metas saiu da UI e da API por decisão do humano (2️⃣ — some sem substituto), sem apagar dado; saldo livre da poupança virou o próprio saldo (PR #166).
- **(b2) — a migração destrutiva, e só ela.** `DROP TABLE goals`, `DROP INDEX idx_savings_entries_goal` e remoção de `savings_entries.goal_id` — que no SQLite exige **rebuild da tabela**, por causa da FK. `schema.test.ts` tem asserções sobre `goals`. Em aberto: se `transfer_group` sai junto (hoje fica, sustentando o selo `⇄` de dado legado). **Não roda sem confirmação explícita do humano** — item em `TODO-HUMANO.md`. Não há backup.
- **Fases restantes depois**: **(c)** posição sem ticker (valor aplicado, vencimento, taxa); **(d)** endpoint `/investments` da Pluggy para preencher.
- **Risco de dupla contagem com a T-089e**: o dinheiro na caixinha **saiu** da conta corrente, então saldo de conta + posição de caixinha não se sobrepõem — mas se a Pluggy devolver a caixinha *também* como conta, soma duas vezes. Conferir contra o payload real antes de somar.
- **Herdado da (a)**, para a (c)/(d): o hub usa o total da carteira B3 como valor de qualquer nó não-"em breve" — quando Renda Fixa ganhar dado real, mapear valor por `node.key`.
- **Aceite (por fase)**: carteira B3 e poupança seguem com os mesmos números; nenhuma linha de `goals` apagada na (b1); suítes verdes.

### T-104 — Migrar os `*-core` restantes para o formato-alvo (guarda-chuva) ⭐ PRÓXIMA
- **Status**: PENDENTE · **Complexidade**: alta (executor Opus) · **Depende de**: T-103
- **Objetivo**: o alvo (provado no `subscription-core`, generalizado no `validation-core`) é **1 função por arquivo**, **`db` injetado**, testes em `tests/unit/tests/`, **cobertura 100%**, Jest. Uma tarefa/PR por package, **em série** — cada um arrasta call sites e mexe nos mesmos arquivos de config. Ordem e quem já migrou: tabela no `docs/PACKAGES.md`. Próxima: **`savings-core`**, o primeiro core **com `db`**.
- **Atenção na `savings-core`**: o package **encolheu** na T-091b1 (#166) — o par atômico da T-041 e a agregação por meta não existem mais, e o conflito com a T-091 está resolvido. Invariante que sobra e é intocável: **saldo em centavos inteiros** (T-052), com `goal_id` legado contando integral. Achado da T-104a: separar funções expõe branches de default antes cobertos por acidente — rodar `--coverage` cedo.
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
