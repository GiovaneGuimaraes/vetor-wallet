# Backlog de tarefas — escrito pelo orquestrador

> Somente o orquestrador escreve aqui (ver regras em `README.md`). Executores reportam no retorno do subagente; o orquestrador atualiza este arquivo.
>
> Estados: `PENDENTE` → `EM_ANDAMENTO` → (`BLOQUEADA`) → `EM_REVISAO` → `CONCLUIDA` | `CANCELADA`
>
> **Higiene**: ao encerrar um ciclo, o orquestrador move os detalhes das tarefas concluídas para o [`BACKLOG-ARQUIVO.md`](./BACKLOG-ARQUIVO.md), deixando aqui apenas uma linha de resumo por ciclo — este arquivo é lido em toda sessão e precisa ficar enxuto.

## Modelo de tarefa

```markdown
### T-001 — Título curto e imperativo
- **Status**: PENDENTE
- **Prioridade**: P1 | P2 | P3
- **Complexidade**: baixa | média | alta — define o modelo do executor/revisor (ver "Roteamento de modelos" no README.md)
- **Depende de**: — (ou T-xxx; tarefas com dependência não paralelizam)
- **Branch/worktree**: (preenchido ao delegar)
- **Contexto**: por que esta tarefa existe
- **Escopo**: o que fazer, arquivos-alvo prováveis
- **Fora de escopo**: o que NÃO fazer
- **Critério de aceite**: verificável + comando de teste
- **Resultado**: (ao concluir: PR, veredito do revisor, sugestões registradas, modelos usados)
```

---

## Tarefas ativas

_(Ciclo 7, Onda A delegada em 2026-07-25 — T-036, T-037, T-038 em paralelo, arquivos disjuntos.)_

## Ciclo 7 — Feedback do humano pós-ciclo 6 (EM ANDAMENTO)

> Feedback do humano (2026-07-25) após validar os ciclos 5–6: (1) quer **renda variável** não recorrente no layer Renda; (2) **não entendeu a utilidade do "Orçamento do mês"** em Despesas → ocultar da UI (padrão T-026, reversível); (3) logo/mascote do header deve ter **onClick para a home**. Também pediu a arrumação do repo feita pelo orquestrador antes desta onda: remoção de `prd-writer`/`prd-tailwind.md` (sem uso) e arquivamento do histórico do backlog em `BACKLOG-ARQUIVO.md`.

### T-036 — Lançamentos de renda variável com data e visão mensal (`/renda`)
- **Status**: EM_ANDAMENTO (executor Opus 5, delegado 2026-07-25)
- **Prioridade**: P1
- **Complexidade**: alta (schema + rotas + UI + integração na sobra real da Home)
- **Depende de**: —
- **Branch/worktree**: `giovane/t-036-renda-variavel`
- **Contexto**: pedido direto do humano: o layer Renda só tem fontes fixas mensais (`income_sources`); falta registrar renda avulsa/variável que não se repete todo mês (freela pontual, venda, bônus) — espelho do que a T-022 fez para despesas.
- **Escopo**: tabela `income_entries` (`user_id`, `description`, `amount`, `date`, `created_at`) com índice `(user_id, date)`; rotas `GET /api/income-entries?month=YYYY-MM` (default mês corrente, validação igual a `expense-entries`), `POST`, `PATCH /:id` (padrão T-031), `DELETE /:id` — `requireAuth`, isolamento por `user_id`, `Number.isFinite` (T-029); tipos em `shared/`, funções em `api.ts`; `RendaPage` ganha navegação mensal (padrão `DespesasPage`) com duas seções — "Fontes fixas" (existente) e "Rendas do mês" (lista + form + edição/exclusão inline) — e total do mês = fixas + variáveis; **Home**: `computeMonthCashFlow` passa a somar rendas variáveis do mês corrente na sobra real (`realBalance = (renda fixa + rendas variáveis do mês) − fixas − despesas variáveis`; sobra prevista continua renda fixa − despesas fixas), com o mesmo fallback tolerante a falha da T-025; `CLAUDE.md` atualizado (schema + rotas + seção da Home).
- **Fora de escopo**: recorrência de renda; categoria em rendas variáveis; histórico multi-mês em Renda (pode vir depois, como a T-033 fez em Despesas).
- **Critério de aceite**: testes de rota (criação, filtro por mês, PATCH parcial, isolamento cross-user 404, validações 400 incl. Infinity); função pura da Home atualizada com testes (sem rendas variáveis → comportamento atual; com → soma; falha no fetch → fallback sem NaN); total do mês em Renda bate com fixas + variáveis; suíte inteira + build verdes.
- **Resultado**: —

### T-037 — Ocultar a seção "Orçamento do mês" de Despesas (feedback do humano)
- **Status**: EM_ANDAMENTO (executor Sonnet, delegado 2026-07-25)
- **Prioridade**: P2
- **Complexidade**: baixa (remoção de render; backend intacto — padrão T-026)
- **Depende de**: —
- **Branch/worktree**: `giovane/t-037-ocultar-orcamento`
- **Contexto**: feedback do humano (2026-07-25): "não entendi a utilidade do orçamento do mês". A seção (T-023: teto de gasto por categoria com barra de progresso) sai da UI; rotas `/api/budgets`, funções puras e testes ficam intactos para reativação futura se o humano mudar de ideia.
- **Escopo**: remover a seção "Orçamento do mês" (barras, form de orçamento, botão de remover) do render de `DespesasPage.tsx`, limpando estados/imports/handlers órfãos; manter `server/src/routes/budgets.ts`, `budgetProgress.ts` e todos os testes; nota no `CLAUDE.md` (padrão da nota de T-026: rotas ativas sem UI).
- **Fora de escopo**: apagar rotas/funções/testes; mexer nas demais seções da página.
- **Critério de aceite**: página Despesas sem a seção; testes existentes de `budgets` e `budgetProgress` continuam verdes; suíte + build verdes. Teste novo dispensado (remoção de UI sem lógica nova).
- **Resultado**: —

### T-038 — Logo/mascote do header clicável → home
- **Status**: CONCLUIDA e MERGEADA — PR [#77](https://github.com/GiovaneGuimaraes/vetor-wallet/pull/77) (2026-07-25). Revisor: APROVADA, 0 bloqueantes — `Link` SPA do react-router, visual preservado nos dois temas (`color: inherit`), header sticky e mascote por rota intocados; landing sem header equivalente (grep). Web 113 / build verdes. Modelos: executor Sonnet, revisor Sonnet.
- **Prioridade**: P3
- **Complexidade**: baixa (só navegação no shell)
- **Depende de**: —
- **Branch/worktree**: `giovane/t-038-logo-clicavel`
- **Contexto**: pedido direto do humano: a logo (mascote por layer) no header deve levar para a home do app ao clicar.
- **Escopo**: no header do shell (`web/src/layout/AppShell.tsx` ou equivalente da T-004), envolver logo/mascote + wordmark num link/botão que navega para `/home` (react-router, sem reload), com `aria-label`, cursor pointer e sem quebrar o layout sticky; comportamento em todas as rotas autenticadas; na landing/auth (se o header aparecer lá), decidir o destino coerente (ex.: `/`) e documentar.
- **Fora de escopo**: redesign do header; decisão logo oficial × mascotes (T-020, parada no TODO-HUMANO).
- **Critério de aceite**: clique na logo em qualquer layer leva a `/home` sem reload; build verde. Teste dispensado (navegação/UI) ou função pura se houver lógica de destino.
- **Resultado**: —

## Em espera (decisão do humano — ver `TODO-HUMANO.md`)

### T-020 — Logo oficial no header e na AuthPage
- **Status**: PENDENTE — decisão de UX pendente: mascotes vs logo oficial no header (favicon/head já entregues na T-018).

### T-021 — Validação de SELL por data histórica
- **Status**: PENDENTE — avaliar custo/benefício (SELL retroativo é validado contra a posição de hoje; documentado como decisão consciente no `CLAUDE.md`).

## Candidatas (não urgentes, colhidas das revisões dos ciclos 5–6)

- Validação de data real (`DATE_RE` aceita `2026-13-45`) — POST e PATCH juntos, todas as rotas com data.
- `AND user_id` no UPDATE final dos PATCH (defesa em profundidade; padrão atual herdado de `goals.ts`).
- POST de lançamento recorrente com 3 escritas não transacionais; teste unitário de `isUniqueViolation`.
- Editar template de recorrência (valor/dia — decisão de produto: afeta só futuras).
- Dedupe de fetches concorrentes do mesmo mês; flicker de "Carregando" no histórico; `endMonth` do cliente (fuso).
- Sessões: teste direto da varredura de boot; fail-closed para `expires_at` corrompido; `maxAge <= 0`.
- `current_amount` manual obsoleto ao desvincular o último lançamento de uma meta (semântica a decidir).
- Ampliar `/admin`; backend de cripto (aguardando o humano); agendador do job de insights (Lambda/EventBridge); redesign de Alertas/Import (hoje sem UI).

## Ciclos concluídos (detalhes no [`BACKLOG-ARQUIVO.md`](./BACKLOG-ARQUIVO.md))

| Ciclo | Tema | Tarefas | PRs | Suíte ao fim |
|---|---|---|---|---|
| 1 | Paleta 60-30-10 + responsividade | T-001, T-002 | #44, #45 | — |
| 2 | Refactor "Vetor Wallet v4" multi-layer | T-003 a T-013 | #47–#56 | 128 testes |
| 3 | Robustez e dívidas técnicas | T-014, T-015, T-017, T-018 | #57–#60 | 132+13 |
| 4 (Onda A) | SELL do CSV por wallet + P&L diário | T-019, T-016 | #61, #62 | 147+19 |
| 5 | Layers básicos (Mobills/Organizze/Wallet) | T-022 a T-027 | #63–#68 | 190+63 |
| 6 | Colheita das revisões + edição inline + Onda C | T-028 a T-035 | #69–#76 | 342+113 |
