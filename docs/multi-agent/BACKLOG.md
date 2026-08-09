# Backlog de tarefas — escrito pelo orquestrador

> Somente o orquestrador escreve aqui (regras em `README.md`). Executores reportam no retorno do subagente.
>
> Estados: `PENDENTE` → `EM_ANDAMENTO` → (`BLOQUEADA`) → `EM_REVISAO` → `CONCLUIDA` | `CANCELADA`

## Higiene — regra dura (2026-08-09)

Este arquivo é lido em **toda** sessão do orquestrador, então cada caractere aqui é pago
repetidamente. Ele contém **apenas trabalho vivo**.

- **Tarefa concluída sai daqui**, não migra para outro arquivo do repo. O registro do que foi
  feito já existe em dois lugares melhores: as **PRs mergeadas** e o **histórico do git**.
  Documentação de *como o app é hoje* pertence aos `CLAUDE.md` de cada package e a
  `docs/decisions/` — nunca a um backlog, que descreve estados intermediários já superados.
- **Teto de 8 KB**, verificado por `pnpm backlog:check`. Estourou, é sinal de que há tarefa
  concluída ou spec inflada aqui dentro.
- **Tarefa viva cabe em ~700 caracteres**: objetivo, aceite, complexidade, arquivos-alvo.
  Post-mortem (resultado, achados do revisor, histórico de reprovação) não nasce aqui — vai
  para o corpo da PR, e o que muda decisão futura vai para `CALIBRAGEM.md`.
- **Pendência que depende do humano não é backlog** — vai para `TODO-HUMANO.md`.

## Modelo de tarefa

```markdown
### T-000 — Título curto e imperativo
- **Status**: PENDENTE · **Complexidade**: baixa | média | alta · **Depende de**: —
- **Objetivo**: por que existe e o que fazer.
- **Arquivos-alvo**: caminhos prováveis.
- **Critério de aceite**: verificável + comando de teste.
```

---

## Fila

### T-104 — Migrar os `*-core` restantes para o formato-alvo
- **Status**: PENDENTE (guarda-chuva) · **Complexidade**: alta · **Depende de**: T-103 (piloto, concluída)
- **Objetivo**: os cores restantes seguem no formato antigo (arquivo-balaio, `db` importado do singleton, teste em `src/**/*.test.ts`). O alvo — provado no `subscription-core` e generalizado no `validation-core` — é **1 função por arquivo**, **`db` injetado**, testes em `tests/unit/tests/`, **cobertura 100%**, Jest.
- **Ordem (uma tarefa/PR por package, em série)**: ~~`validation-core` (T-104a ✅)~~ → **`savings-core`** → `expenses-core` → `bank-import-core` → `auth-core` → `insights-core` → `portfolio-core`.
- **Por que em série**: cada package arrasta call sites do `rest-api`/`cli` e mexe nos mesmos arquivos de config; worktrees paralelos conflitam.
- **Fonte da verdade de quem já migrou**: tabela em `docs/PACKAGES.md` § "Estado da migração de formato".
- **Fora de escopo**: mudar regra de negócio; desfazer os acoplamentos core→core pré-existentes (ver Candidatas).

### T-104b — `savings-core` no formato-alvo — PRÓXIMA DA FILA
- **Status**: PENDENTE · **Complexidade**: **alta** (executor Opus) · **Depende de**: T-104a
- **Objetivo**: primeiro core **com `db`** — é aqui que a injeção de dependência sai do piloto e passa a valer para um domínio real, e o primeiro que **arrasta call sites de verdade** (as rotas passam a receber `db` explícito). Quebrar em 1 função por arquivo, `index.ts` só barrel, testes para `tests/unit/tests/`, cobertura 100%.
- **Arquivos-alvo**: `packages/savings-core/src/{savings,goals}.ts` → N arquivos; rotas de savings/goals no `rest-api`; `packages/savings-core/CLAUDE.md`; tabela do `PACKAGES.md`.
- **Invariantes que NÃO podem mudar**: transferência poupança → meta é **par atômico** (T-041); saldo livre comparado em **centavos inteiros** (T-052).
- **Atenção (achado da T-104a)**: separar funções que dividiam um arquivo expõe branches de parâmetro default antes cobertos por acidente. Rodar `--coverage` cedo, não só no fim.
- **Critério de aceite**: `pnpm --filter @vetor-wallet/savings-core test` verde com cobertura 100%; `pnpm build`, `pnpm lint`, `pnpm format:check` e `pnpm test` da raiz verdes; contagem de testes do `rest-api` preservada ou maior.

## Candidatas (débito latente — não urgente, o orquestrador puxa daqui)

- **Acoplamentos core→core** (violam a regra 6 do `PACKAGES.md`; pré-existentes, tornados visíveis pela extração): `auth-core → portfolio-core` e `insights-core → portfolio-core` — a saída é a **rota** orquestrar os dois módulos. E `portfolio-core/snapshots.ts` tem um **segundo client da brapi** (`fetchQuotesStrict`, que lança) paralelo ao `brapi-core.fetchQuotes` (que degrada em silêncio) — unificar no `brapi-core`.
- **Limpar backend de budgets** (rotas + tabela `category_budgets` + tipo no shared): a UI saiu na T-089 e nada mais consome.
- **`buildIbovespaSeries` data em UTC** enquanto a rota ancora em BRT — candle após 21h BRT pode ser datado como "amanhã" e recortado (achado da T-095).
- **Glob do Prettier não alcança a raiz dos packages** — `packages/rest-api/vitest.config.ts` segue fora do padrão e o CI não detecta (achado da T-105).
- **Três origens de mascote no web** montam `/layers/<arquivo>` com mapas próprios (`mascots.ts`, `AuthPage.tsx`, `HomePage.tsx`); só a primeira foi unificada na T-020.
- **Nenhum teste de render de componente existe no `web`** — funções puras provam a decisão, não que o componente a chama (sugestão repetida pelos revisores da T-076 e T-101).
- **Backfill histórico de snapshots** via `hourly_quote_insights`; agendador do job de insights (Lambda/EventBridge — o da T-061 é in-process e morre com o processo).
- **Caixa de entrada de revisão** para transações importadas (extratos reais têm estorno e transferência entre contas próprias); endpoint `investments` da Pluggy para reconciliar posição B3.
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
