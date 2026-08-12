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
- **Status**: PENDENTE (guarda-chuva) · **Complexidade**: alta · **Depende de**: T-087 (concluída)
- **Objetivo**: hoje não existe no app — é job de terminal com o `itemId` num `.env`, ou seja **uma instalação, um usuário**. Decisão de 2026-08-12: **produto multi-usuário**, cada um conecta o próprio banco por um botão.
- **Fases, em série**: (a) tabela `pluggy_items(user_id, item_id, connector, status)`, e o job itera os items do usuário em vez de ler env; (b) `POST /api/pluggy/connect-token` (mina no **servidor** — `clientSecret` nunca vai ao browser) e `POST /api/pluggy/items`, atrás de `requireActiveSubscription`; (c) botão + widget do `cdn.pluggy.ai`; (d) gatilho de sync — sem ele o usuário conecta, nada aparece e a feature parece quebrada.
- **Gating binário** por decisão do humano: `plans` não tem coluna de capacidade, então todo pagante inclui a integração.
- **BLOQUEIA A ENTREGA, não a construção**: conector 200 é gratuito só para uso **pessoal**; multi-CPF comercial exige contrato pago (`TODO-HUMANO.md`).
- **Aceite**: dois usuários com items distintos, cada um só vê os seus; sem assinatura → 402; suítes verdes.

### T-088 — Movimentação interna não pode virar despesa/renda
- **Status**: PENDENTE · **Complexidade**: alta · **Depende de**: T-087 (concluída, #159)
- **Objetivo**: o dry-run real mostrou que a importação crua confunde movimentação interna com gasto: **aplicação em reserva** entra como **despesa** (era a maior parte do débito do mês, que apareceria vários múltiplos acima do real), o **resgate** entra como **renda**, e o **pagamento de fatura** conta **duas vezes** (despesa na conta, renda no cartão). Valor real do humano **não entra em arquivo versionado** — repo público.
- **Sinal**: a `category` da Pluggy vem preenchida no plano grátis — `Investments`, `Same person transfer`, `Credit card payment`.
- **Decisão parcial do humano (2026-08-12)**: `Investments` vai para o **layer de investimentos** (Candidatas), não para poupança. As outras duas escolhas seguem abertas no `TODO-HUMANO.md` — até lá, **proibido rodar sem `--dry-run`**.
- **Vale também para o OFX** (T-085).
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

## Ciclos concluídos

Detalhe de cada tarefa: PRs no GitHub e `git log`. Calibragem de modelos: `CALIBRAGEM.md`.

| Ciclo | Tema | PRs |
|---|---|---|
| 1–4 | Paleta, responsividade, refactor v4 multi-layer, robustez, P&L diário | #44–#62 |
| 5–8 | Layers básicos, edição inline, renda variável, simulador, transferência poupança→meta | #63–#83 |
| 9–12 | Endurecimento (datas, transação, sessões, `user_id`), carteira única, rigor monetário, dash de ações | #84–#106 |
| 13–15 | Agendador de snapshots, benchmarks CDI/IBOV, monetização (AbacatePay/Pix, planos, gating) | #107–#119 |
| 16 | Modo consulta nos layers + achados da revisão + importação OFX | #120–#132 |
| 17–18 | Ajustes de UX, redesign de planos, página `/conta` (perfil + troca de senha) | #134–#141 |
| 19 | **Arquitetura em módulos**: `packages/*-core`, config única de lint, Prettier no CI | #142–#150 |
| 20 | Formato-alvo dos cores (`subscription-core`, `validation-core`), rename `rest-api`, logo da marca | #151–#152 |
