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
- **Status**: fase (a) **CONCLUIDA** (#160) · próxima: **(b) rotas** · **Complexidade**: alta
- **Objetivo**: decisão de 2026-08-12 — **produto multi-usuário**, cada um conecta o próprio banco por um botão. Antes da fase (a) a integração era job de terminal com o `itemId` num `.env`: uma instalação, um usuário.
- **Fases, em série**: ~~(a) tabela `pluggy_items` + job iterando os items ✅~~; **(b)** `POST /api/pluggy/connect-token` (mina no **servidor**) e `POST /api/pluggy/items`, atrás de `requireActiveSubscription`, mais o `DELETE /items/{id}` na Pluggy que a (a) deixou pendente; **(c)** botão + widget do `cdn.pluggy.ai`; **(d)** gatilho de sync — sem ele o usuário conecta, nada aparece e parece quebrado.
- **Da fase (a), para não reabrir**: `item_id` tem unicidade **global** porque é credencial *portadora* — por usuário, B importaria o extrato de A.
- **Gating binário** (decisão do humano): `plans` não tem coluna de capacidade, então todo pagante inclui a integração.
- **Gate `ENVIRONMENT` (decisão do humano, 2026-08-12)**: env nova no `rest-api` — `Staging` **libera** a integração, `Production` **bloqueia**. **Fail closed**: ausente, vazia ou valor desconhecido = bloqueado, porque o desfecho de errar é violar os termos da Pluggy. O gate vive na **rota** (esconder o botão é UX, não bloqueio) e o web só **lê** o estado via API — nunca uma segunda cópia da flag em `VITE_*`.
- **Aceite**: dois usuários com items distintos, cada um só vê os seus; sem assinatura → 402; `Production` bloqueia a rota; suítes verdes.

### T-090 — `pnpm discord:check`: guard do espelho do Discord
- **Status**: EM_ANDAMENTO · **Complexidade**: média (executor Sonnet) · **Depende de**: —
- **Objetivo**: a regra "espelhar é parte de concluir" nasceu em prosa e **falhou no mesmo dia** — mesma história do teto do backlog, que só valeu como script no CI. Reprovar quando o último commit que tocou `BACKLOG.md`/`TODO-HUMANO.md` for **mais novo** que o espelho registrado em `discord-state.json`.
- **Arquivos-alvo**: `tools/`, teste no padrão do `backlog-guard`, script na raiz, step no `ci.yml`.
- **Aceite**: sujo reprova, limpo passa, teste dos dois; `lint`, `format:check`, `backlog:check` e `pnpm test` verdes.

### T-088 — Movimentação interna não pode virar despesa/renda
- **Status**: PENDENTE · **Complexidade**: alta · **Depende de**: T-087 (concluída, #159)
- **Objetivo**: o dry-run real mostrou que a importação crua confunde **movimentação interna** com gasto: aplicação em reserva entra como **despesa** (a maior parte do débito do mês), o resgate como **renda**, e o pagamento de fatura conta **duas vezes**. Contexto completo no `TODO-HUMANO.md`; valor real do humano **não entra em arquivo versionado** (repo público).
- **Sinal**: a `category` da Pluggy vem preenchida no plano grátis — `Investments`, `Same person transfer`, `Credit card payment`.
- **Decisão parcial (2026-08-12)**: `Investments` vai para o **layer de investimentos** (Candidatas), não para poupança. As outras duas seguem abertas — até lá, **proibido rodar sem `--dry-run`**. Vale também para o OFX (T-085).
- **Aceite**: com fixtures anonimizadas, nenhuma aplicação/resgate/fatura vira despesa ou renda; suítes verdes.

## Candidatas (débito latente — não urgente, o orquestrador puxa daqui)

- **Layer de Ações → Investimentos** (decisão do humano, 2026-08-12): generalizar para abrigar renda fixa, que não tem ticker da B3 nem cotação da brapi. É o destino do caso `Investments` da T-088 — refatoração de modelo, não ajuste de importador.

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
