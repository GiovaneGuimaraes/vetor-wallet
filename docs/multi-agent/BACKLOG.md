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

## Tarefas ativas — Ciclo 11: histórico real da carteira (T-058) + colheita do ciclo 10

> Aprovado pelo humano em 2026-07-25 ("pode seguir para o proximo ciclo"). Ondas: **1** (paralela): T-058a, T-059 → **2**: T-058b (depende da T-058a).

### T-058a — Server: ligar a coleta diária de snapshots + `GET /api/portfolio/history`
- **Status**: EM_REVISAO (executor opus: catch-up pós-listen não-fatal, `portfolioHistory.ts` puro com forward-fill, rota em portfolio.ts, tipos em shared; 521 server verdes, +32) · P1 · alta
- **Contexto**: achado do spike da dash — `runSnapshotJob`/`catchUpIfNeeded` (`services/snapshots.ts`) são código morto; `quote_snapshots` tem 11 linhas paradas em 14/07. Sem coleta não há gráfico de evolução.
- **Escopo**: (1) chamar `catchUpIfNeeded()` no boot (`index.ts`, após `initDb`, não-fatal); (2) `GET /api/portfolio/history?days=90` → `{ points: [{ date, value, invested }] }`, `400` para days inválido/fora de 1..365; agregação em `services/portfolioHistory.ts` puro: posição por data via `buildPositionMap` (sem duplicar preço médio) × último preço conhecido ≤ data (forward-fill); dias sem preço ausentes (cliente preenche); filtro por usuário via operations (snapshots não têm user_id); (3) testes: rota com 2 usuários (isolamento), forward-fill, days inválido, service puro.
- **Critério de aceite**: suíte server verde; boot faz catch-up sem derrubar o server se a brapi falhar.

### T-058b — Web: gráfico de evolução real da carteira na dash
- **Status**: PENDENTE (Onda 2) · P1 · média · **Depende de**: T-058a
- **Escopo**: fetch de `/api/portfolio/history` em `api.ts`; gráfico reusando `chartGeometry`/`ProjectionChart` (ou variante) com a série real + linha do investido; estado vazio para base sem histórico ("o histórico começa a ser coletado a partir de agora"); seletor simples de janela (30/90/365 dias) opcional se couber.

### T-059 — Colheita das revisões do ciclo 10
- **Status**: CONCLUIDA — PR #103 (2026-07-25). Executor sonnet, revisor opus (APROVADA). Sugestões → candidatas: re-SELECT de alerts/wallets sem user_id (últimos remanescentes); rótulo `'preço'` no erro do CSV; threshold percentual de 2 casas a revisitar com a UI de alertas.
- **Escopo**: `AND user_id` nos re-SELECT de POST; `isValidMoneyAmount` em `price` (operations/import) e `threshold` (alerts); teste fixando a ordem das validações; teste do clamp de alocação > 100; teste do área-path com 1 ponto.

## Em espera (decisão do humano — ver `TODO-HUMANO.md`)

### T-020 — Logo oficial no header e na AuthPage
- **Status**: PENDENTE — decisão de UX pendente: mascotes vs logo oficial no header (favicon/head já entregues na T-018).

### T-021 — Validação de SELL por data histórica
- **Status**: PENDENTE — avaliar custo/benefício (SELL retroativo é validado contra a posição de hoje; documentado como decisão consciente no `CLAUDE.md`).

## Candidatas (não urgentes)

> As colheitas dos ciclos 9 e 10 foram resolvidas pelas tarefas T-051–T-055 (Ciclo 10). Abaixo, só o que segue aberto.

- Projeção com aporte mensal recorrente + comparação com CDI (poupança e dash — sugestões da T-040 e do spike da dash; confirmar com o humano).
- Editar template de recorrência (valor/dia — decisão de produto: afeta só futuras).
- `current_amount` manual obsoleto ao desvincular o último lançamento de uma meta (semântica a decidir).
- **T-058 (próximo ciclo, destrava o gráfico histórico)**: agendar `catchUpIfNeeded()` no boot (hoje é código morto — `quote_snapshots` tem 11 linhas paradas em 14/07) + `GET /api/portfolio/history?days=` (contrato esboçado no spike da dash) + gráfico de evolução real.
- Colheita das revisões do Ciclo 10: simetria `AND user_id` nos re-SELECT de POST; `isValidMoneyAmount` também em `price` (operations/import) e `threshold` (alerts); teste fixando a ordem das validações; limite superior explícito de `amount`; teste da corrida de POSTs de wallets; teste do clamp de alocação com valor > 100; teste do área-path com 1 ponto; colisão de rótulos do gráfico com valores na casa dos bilhões.
- **Agendador in-process da coleta de snapshots** (achado da T-058a): só o boot dispara o catch-up — um server que sobe às 9h e fica no ar nunca captura o fechamento; `setInterval` in-process (ou cron do SO) resolveria barato até o Lambda existir. Backfill via `hourly_quote_insights` também candidato.
- Colheita da revisão da T-058a: laço do history com um positionMap vivo (O(ops+dias) em vez de O(dias×ops)); piso de data na query de snapshots + `MAX(captured_at)` por ticker (quando a coleta virar diária de verdade); usuário próprio no teste do SELL (estado mutável entre casos).
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
| 7 | Feedback do humano: renda variável, ocultar orçamento, logo clicável (+ arrumação docs/repo) | T-036 a T-038 | #77–#79 | 370+122 |
| 8 | Pedidos do humano pré-onda: landing c/ Despesas, simulador de rendimento, transferência poupança→meta, labels de renda | T-039 a T-042 | #80–#83 | 411+171 |
| 9 | Colheita das revisões (5–8) + endurecimento (datas, transação, sessões, user_id) + carteira única | T-043 a T-050b | #84–#92 | 460+177 |
| 10 | Colheita do ciclo 9 + rigor monetário + dash de ações (projeção de ganhos, gráfico SVG, alocação) | T-051 a T-057c | #93–#102 | 489+250 |
