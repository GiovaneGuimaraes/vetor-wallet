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

## Tarefas ativas — Ciclo 10: colheita do ciclo 9 + dash de ações (projeções e gráfico)

> Aprovado pelo humano em 2026-07-25 (Parte A + pedido novo: "projecoes de ganhos em cima das minhas acoes atuais e algum grafico para melhorar a page" — reverte o "sem gráficos" para a dash de ações). Ondas: **A1** (paralela): T-051, T-053, T-054, T-055 → **A2**: T-052 (mesmo `routes/savings.ts` da T-051) → **B** (após spike): T-056, T-057.

### T-051 — Re-SELECT dos PATCH com `AND user_id` + teste-guarda real
- **Status**: CONCLUIDA — PR #94 (2026-07-25). Executor sonnet, revisor opus (APROVADA; spy validado por 2 mutações reais). Sugestões → candidatas: simetria nos re-SELECT de POST; `SELECT id IN` do transfer (T-052 olha).
- **Prioridade**: P2 · **Complexidade**: baixa (toca isolamento → revisor opus)
- **Contexto**: colheita da revisão da T-044 — o UPDATE já filtra por `user_id`, mas o re-SELECT final que monta a resposta dos PATCH ainda é `WHERE id = ?`; e o teste da T-044 prova o SQLite, não a rota.
- **Escopo**: `AND user_id = ?` no re-SELECT final dos PATCH (income, expenses, expenseEntries, incomeEntries, savings, recurringExpenses, goals — onde se aplicar); teste espionando `db.execute` que assevera o par sql/args emitido pela rota (pega cláusula e ordem).
- **Critério de aceite**: re-SELECTs filtrados; teste-spy cobrindo ≥1 rota; suíte server verde.

### T-052 — Rigor monetário em savings
- **Status**: PENDENTE (Onda A2)
- **Prioridade**: P2 · **Complexidade**: média (dinheiro → revisor opus)
- **Depende de**: T-051 (mesmo `routes/savings.ts`)
- **Escopo**: (1) guard explícito no 201 de `/transfer-to-goal` (`if (!withdraw || !deposit) throw` → 500 do errorHandler) no lugar do `as SavingsEntry`; (2) rejeitar `amount` com > 2 casas decimais na entrada (POST/PATCH de savings e transfer-to-goal; avaliar aplicar o mesmo validador aos demais layers monetários — income/expenses/entries/goals/budgets — por consistência, com testes).
- **Critério de aceite**: `0.125` → 400 com mensagem clara; guard coberto; suíte verde.

### T-053 — Polimento da carteira única (server)
- **Status**: EM_REVISAO (executor sonnet: POST via service + UPDATE de campos, adoção de órfãs testada, asserção por ids; 461 verdes, +1; dúvida do executor sobre acentos na mensagem — revisor avalia)
- **Prioridade**: P3 · **Complexidade**: baixa (revisor opus por tocar adoção de dados)
- **Escopo**: colheita da revisão da T-050a — `POST /api/wallets` reusa `getOrCreateDefaultWallet` (aplicando o `name` do body; passa a adotar operações órfãs); JSDoc mencionando a linha órfã que a corrida do auto-create pode deixar; asserção por ids (não tamanho) no teste do GET com `?walletId=`; padronizar a mensagem de erro com as vizinhas.
- **Critério de aceite**: comportamentos cobertos por teste; suíte verde.

### T-054 — Higiene do web (colheita T-049/T-050b)
- **Status**: CONCLUIDA — PR #95 (2026-07-25). Executor sonnet, revisor sonnet (APROVADA, sem bloqueantes).
- **Prioridade**: P2 · **Complexidade**: média
- **Escopo**: `getPortfolio()` fora do `try` do `getWallets()` em `App.tsx`; consolidar o fetch duplicado de `/api/portfolio` (shell + DashboardPage) no contexto; parâmetro `force` no `MonthFetchGuard` para o `refreshEntries` do caminho de erro do delete; remover comentário órfão do `App.css`; teste de `projectSavings(0, entrada inválida, ...)`.
- **Critério de aceite**: um único fetch de portfolio no primeiro load de `/dash`; suíte e build web verdes.

### T-055 — CLI reusa `isValidIsoDate` + sobras de sessões
- **Status**: CONCLUIDA — PR #93 (2026-07-25). Executor sonnet, revisor sonnet (APROVADA, sem bloqueantes).

### T-052 — Rigor monetário em savings (+ demais rotas monetárias)
- **Status**: EM_ANDAMENTO (Onda A2, executor sonnet — inclui notas do revisor da T-051 sobre o `SELECT id IN` do transfer)
- **Prioridade**: P3 · **Complexidade**: baixa
- **Escopo**: `cli/src/hourlyInsights.ts` valida a data do argv com o helper do server (path alias); comentário no helper sobre anos 0–99; sessões: asserção mais forte no teste da varredura (sid único/isolamento) e simetria no teste de `touch` (get → null).
- **Critério de aceite**: `2026-02-30` rejeitado no CLI; suíte server verde.

### Onda B — dash de ações (spike Plan/Opus concluído; achado: `quote_snapshots` quase vazio — coleta nunca foi agendada, `catchUpIfNeeded` é código morto → gráfico HISTÓRICO inviável agora; adotado: curva de PROJEÇÃO + barras de alocação; tudo client-side sem endpoint novo, SVG puro sem lib; T-058 destrava o histórico no próximo ciclo)

### T-056a — `portfolioProjection.ts` (módulo puro de projeção)
- **Status**: EM_ANDAMENTO (executor sonnet) · P1 · média
- **Escopo**: `projectPortfolio` (compostos, aceita taxa negativa > -100 — diverge da T-040 de propósito), `deriveMonthlyReturnPct` (retorno geométrico realizado; data de compra média ponderada pelo investido; < 1 mês → null), `parseSignedInput`; reusa parsers de `savingsProjection`.

### T-056b — Card "Projeção de ganhos" na DashboardPage
- **Status**: PENDENTE · P1 · média · **Depende de**: T-056a, T-054 (mergeada)
- **Escopo**: 3 campos com `simTouched` (valor = `totalCurrentValue ?? totalInvested`, taxa derivada, prazo 12), resultados com `--color-up/down`, hints (quotesUnavailable, taxa não derivável).

### T-057a — `chartGeometry.ts` (matemática pura do gráfico)
- **Status**: EM_REVISAO (executor sonnet: 5 funções + 26 testes; rejeita taxa ≤ -100; 203 web verdes) · P1 · média
- **Escopo**: `buildProjectionSeries` (≤ ~24 pts), `scaleLinear` (domínio degenerado), `buildLinePath`/`buildAreaPath`, `pickTicks`.

### T-057b — `ProjectionChart.tsx` (SVG puro) + ligação no card
- **Status**: PENDENTE · P1 · média · **Depende de**: T-056b, T-057a (mesmo `DashboardPage.tsx` da T-056b — sequencial)
- **Escopo**: SVG viewBox 320×140 responsivo, cores via CSS vars (tema de graça), aria/title pt-BR, sem tooltip na v1; estados vazios do plano do spike.

### T-057c — Barras de alocação por ticker
- **Status**: PENDENTE · P2 · baixa · **Depende de**: T-057b (mesmo DashboardPage)
- **Escopo**: reusa padrão `.vw-budget-progress-*`; `allocationPct` null → barra vazia, nunca NaN.

## Em espera (decisão do humano — ver `TODO-HUMANO.md`)

### T-020 — Logo oficial no header e na AuthPage
- **Status**: PENDENTE — decisão de UX pendente: mascotes vs logo oficial no header (favicon/head já entregues na T-018).

### T-021 — Validação de SELL por data histórica
- **Status**: PENDENTE — avaliar custo/benefício (SELL retroativo é validado contra a posição de hoje; documentado como decisão consciente no `CLAUDE.md`).

## Candidatas (não urgentes)

> As candidatas colhidas das revisões dos ciclos 5–8 foram promovidas às tarefas T-043–T-049 do Ciclo 9 (2026-07-25).

- Projeção com aporte mensal recorrente + comparação com CDI no simulador (sugestão do executor da T-040 — confirmar com o humano).
- Colheita das revisões do Ciclo 9/Onda 1: teste espionando `db.execute` nos PATCH (guarda real da cláusula `AND user_id`); re-SELECT final das respostas de PATCH também sem `AND user_id`; asserção mais forte no teste da varredura de sessões + simetria no teste de `touch`; teste de `projectSavings(0, inválido, ...)`.
- Colheita da revisão da T-048: guard explícito (`throw`) no 201 de `/transfer-to-goal` no lugar do `as SavingsEntry`; validar valores monetários com > 2 casas decimais na entrada (hoje só `> 0` finito — o summary arredonda por lançamento).
- Colheita da revisão da T-049: o `refreshEntries(monthKey)` do caminho de erro do delete (`DespesasPage`/`RendaPage`) pode ser engolido pelo dedupe com fetch do mesmo mês em voo, deixando a remoção otimista indevida — parâmetro `force` no guard (cenário estreito).
- Colheita da revisão da T-043: comentário no helper `isValidIsoDate` sobre a rejeição (acidental porém desejada) de anos 0–99; CLI `hourlyInsights.ts` reusar o helper via path alias em vez do regex próprio (hoje aceita `2026-02-30` na linha de comando).
- Colheita da revisão da T-050a: JSDoc mencionando a linha órfã que a corrida do auto-create pode deixar; `POST /api/wallets` reusar `getOrCreateDefaultWallet` (adotaria órfãs); acentuação da mensagem de erro; asserção por ids (não por tamanho) no teste do GET com `?walletId=`.
- Colheita da revisão da T-050b: mover `getPortfolio()` para fora do `try` do `getWallets()` em `App.tsx` (falha do rótulo não deveria zerar o card Ações); consolidar o fetch duplicado de `/api/portfolio` (shell + DashboardPage) no contexto; remover comentário órfão em `App.css`.
- Editar template de recorrência (valor/dia — decisão de produto: afeta só futuras).
- `current_amount` manual obsoleto ao desvincular o último lançamento de uma meta (semântica a decidir).
- **T-058 (próximo ciclo, destrava o gráfico histórico)**: agendar `catchUpIfNeeded()` no boot (hoje é código morto — `quote_snapshots` tem 11 linhas paradas em 14/07) + `GET /api/portfolio/history?days=` (contrato esboçado no spike da dash) + gráfico de evolução real.
- Aporte mensal na projeção da dash + linha de referência CDI (sugestões do spike, aguardam humano).
- Colheita da revisão da T-051: simetria `AND user_id` nos re-SELECT de POST (seguros na prática — id do próprio INSERT).
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
