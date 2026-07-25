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

## Tarefas ativas — Ciclo 9: colheita das revisões + endurecimento + carteira única

> Aprovado pelo humano em 2026-07-25. Ordem de ondas (tarefas que tocam os mesmos arquivos rodam em série):
> **Onda 1** (paralela): T-044, T-046, T-047 → **Onda 2** (paralela): T-048, T-049 → **Onda 3**: T-045 → **Onda 4**: T-043 → **Onda 5**: T-050 (pedido do humano: "faça isso depois").

### T-044 — `AND user_id` no UPDATE final de todos os PATCH
- **Status**: CONCLUIDA — PR #85 mergeada (2026-07-25). Executor sonnet, revisor opus (APROVADA, sem bloqueantes; teste de mutação confirmou ordem dos parâmetros). Sugestões → candidatas: teste espionando `db.execute`; re-SELECT final das respostas também sem `AND user_id`.
- **Prioridade**: P1
- **Complexidade**: baixa (mecânica, mas toca isolamento por usuário → revisor opus)
- **Depende de**: —
- **Branch/worktree**: (worktree do executor)
- **Contexto**: candidata colhida das revisões — os PATCH localizam o registro por `id AND user_id` no SELECT, mas o UPDATE final usa só `id` (padrão herdado de `goals.ts`). Defesa em profundidade contra TOCTOU/regressões futuras.
- **Escopo**: adicionar `AND user_id = ?` ao UPDATE final dos PATCH de `server/src/routes/`: `income.ts`, `expenses.ts`, `expenseEntries.ts`, `incomeEntries.ts`, `savings.ts`, `goals.ts`, `recurringExpenses.ts` (onde se aplicar). Teste cobrindo ao menos uma rota (UPDATE não afeta registro de outro usuário mesmo com id válido).
- **Fora de escopo**: mudar semântica de resposta (404 continua vindo do SELECT); refatorar as rotas.
- **Critério de aceite**: todos os UPDATEs de PATCH filtram por `user_id`; `pnpm --filter vetor-wallet-server test` verde.
- **Resultado**: —

### T-046 — Robustez de sessões (varredura de boot, `expires_at` corrompido, `maxAge <= 0`)
- **Status**: CONCLUIDA — PR #86 mergeada (2026-07-25). Executor sonnet, revisor opus (APROVADA, sem bloqueantes). CLAUDE.md atualizado na integração (comportamentos novos documentados). Sugestões → candidatas: asserção mais forte no teste da varredura; simetria no teste de `touch`.
- **Prioridade**: P2
- **Complexidade**: baixa (toca auth → revisor opus)
- **Depende de**: —
- **Branch/worktree**: (worktree do executor)
- **Contexto**: candidatas colhidas da revisão da T-034 (`SqliteSessionStore`).
- **Escopo**: `server/src/auth/sessionStore.ts` + testes: (1) teste direto da varredura de limpeza do boot; (2) fail-closed quando `expires_at` está corrompido/não-ISO (tratar como expirada, apagar); (3) comportamento definido para `cookie.maxAge <= 0` (sessão imediatamente expirada, não TTL fallback).
- **Fora de escopo**: trocar store, Redis, multi-instância.
- **Critério de aceite**: 3 comportamentos cobertos por teste; suíte server verde.
- **Resultado**: —

### T-047 — Refinos do simulador de rendimento (colheita T-040)
- **Status**: CONCLUIDA — PR #84 mergeada (2026-07-25). Executor sonnet, revisor sonnet (APROVADA, sem bloqueantes). Sugestão → candidata: teste de `initial === 0` combinado com entrada inválida.
- **Prioridade**: P2
- **Complexidade**: baixa
- **Depende de**: —
- **Branch/worktree**: (worktree do executor)
- **Contexto**: sugestões do revisor Opus na T-040.
- **Escopo**: `web/src/routes/savingsProjection.ts` (+ `PoupancaPage.tsx` onde couber): (1) curto-circuito `initial === 0` em `projectSavings` (hoje 0 × taxa extrema pode devolver `null`; rendimento 0 é o correto); (2) defaults dos inputs exibidos com vírgula e 2 casas (`toFixed(2).replace('.', ',')`); (3) excluir o mês corrente (incompleto) da amostra de `deriveMonthlyRatePct`. Testes atualizados/novos para os 3 pontos.
- **Fora de escopo**: aporte mensal recorrente e comparação com CDI (decisão do humano pendente); gráficos.
- **Critério de aceite**: `pnpm --filter vetor-wallet-web test` verde com casos novos cobrindo os 3 refinos.
- **Resultado**: —

### T-048 — Refinos da transferência poupança→meta (colheita T-041)
- **Status**: CONCLUIDA — PR #87 mergeada (2026-07-25). Executor sonnet, revisor opus (APROVADA, sem bloqueantes). Sugestões → candidatas: guard explícito no 201 no lugar do `as SavingsEntry`; validar entrada com > 2 casas decimais.
- **Prioridade**: P2
- **Complexidade**: média (toca dinheiro → revisor opus)
- **Depende de**: T-044 (mesmo `routes/savings.ts`)
- **Branch/worktree**: —
- **Contexto**: sugestões do revisor Opus na T-041.
- **Escopo**: (1) `validateTransfer` (`web/src/routes/savingsTransfer.ts`) devolve o número parseado — eliminar dupla conversão em `PoupancaPage.handleSubmit`; (2) tipar o payload do 201 com `SavingsTransferResult` no server (hoje `.find` produz `| undefined` mascarado pelo `res.json`); (3) `buildSummary` somar em centavos, alinhado a `computeBalance` (divergência sub-centavo em razões grandes); (4) `isoDaysAgo` dos testes em fuso local (padrão do app), não UTC; (5) formato "(T-041)" na coluna Path da tabela de rotas do `CLAUDE.md`.
- **Fora de escopo**: desfazer/cascata do par, transferência reversa, rateio de rendimento.
- **Critério de aceite**: suítes server e web verdes; `toEqual` dos summaries continua passando.
- **Resultado**: —

### T-049 — Higiene do fetch mensal no web + `endMonth` explícito
- **Status**: CONCLUIDA — PR #88 mergeada (2026-07-25). Executor sonnet, revisor opus (REPROVADA 1ª rodada por CLAUDE.md contraditório + lacuna de teste positivo; corrigido; APROVADA no re-veredito). Sugestão → candidata: `force` no dedupe para o `refreshEntries` do caminho de erro do delete.
- **Prioridade**: P2
- **Complexidade**: média
- **Depende de**: T-044 (mesmo `routes/expenseEntries.ts`)
- **Branch/worktree**: —
- **Contexto**: candidatas das revisões (T-030/T-033): fetches concorrentes do mesmo mês duplicados, flicker de "Carregando" no histórico, e a janela do `/summary` ancorada no fuso do server (ponto documentado no `CLAUDE.md`).
- **Escopo**: dedupe de fetches concorrentes do mesmo mês (`DespesasPage`/`RendaPage`); eliminar flicker do histórico; `GET /api/expense-entries/summary` aceitar `endMonth` opcional (validado como `month`), com o cliente enviando `currentMonthKey()` — atualizar `CLAUDE.md` removendo o ponto de atenção do fuso.
- **Fora de escopo**: caching/estado global; mudar o shape da resposta do summary.
- **Critério de aceite**: testes server (endMonth válido/inválido/default) e web verdes.
- **Resultado**: —

### T-045 — POST de lançamento recorrente transacional + teste de `isUniqueViolation`
- **Status**: CONCLUIDA — PR #89 mergeada (2026-07-25). Executor sonnet, revisor opus (APROVADA; verificou o driver libsql). Sugestões do revisor aplicadas antes do merge (dead code removido, docblocks, CLAUDE.md). Registrado: sem teste de falha no próprio COMMIT (coberto por construção).
- **Prioridade**: P1
- **Complexidade**: média (toca dinheiro/consistência → revisor opus)
- **Depende de**: T-044, T-049 (mesmo `routes/expenseEntries.ts`)
- **Branch/worktree**: —
- **Contexto**: candidata das revisões da T-035 — a criação com `recurring: true` faz 3 escritas não transacionais (entry, template, razão); falha no meio deixa estado parcial.
- **Escopo**: `server/src/routes/expenseEntries.ts` — consolidar as escritas num `db.batch(..., 'write')` (padrão da própria T-035 e da T-041); teste unitário direto de `isUniqueViolation`; teste do caminho transacional.
- **Fora de escopo**: editar template de recorrência (decisão de produto pendente).
- **Critério de aceite**: falha simulada não deixa template órfão/razão inconsistente; suíte server verde.
- **Resultado**: —

### T-043 — Validação de data real em todas as rotas com data
- **Status**: CONCLUIDA — PR #90 mergeada (2026-07-25). Executor sonnet, revisor opus (APROVADA; helper validado em 2 fusos extremos). CLAUDE.md anotado na integração. Sugestões → candidatas: comentário sobre anos 0–99 no helper; CLI `hourlyInsights` com regex próprio de formato.
- **Prioridade**: P1
- **Complexidade**: média (transversal, toca dinheiro → revisor opus)
- **Depende de**: T-044, T-045, T-048, T-049 (mesmos arquivos de rotas — roda depois dos merges)
- **Branch/worktree**: —
- **Contexto**: candidata das revisões — `DATE_RE` valida só o formato; `2026-13-45` é aceito e gravado.
- **Escopo**: helper único de validação de data real (calendário, com meses curtos/bissexto) em `server/src/services/`, aplicado a POST **e** PATCH de todas as rotas com `date`: operations, income-entries, expense-entries, savings, transfer-to-goal, import CSV. `400` para data inexistente. Testes por rota (ao menos um caso inválido por endpoint) + testes do helper.
- **Fora de escopo**: rejeitar data futura (o app aceita por decisão); normalizar dados legados.
- **Critério de aceite**: `2026-02-30`/`2026-13-01` → `400` em todas as rotas com data; suíte server verde.
- **Resultado**: —

### T-050 — Carteira única (dividida em T-050a/T-050b pelo spike de design)
- **Status**: spike CONCLUÍDO (Plan/Opus, 2026-07-25). Decisões: modelo "escopo = usuário, carteira vira rótulo"; nada apagado/escondido; `?walletId=`/`wallet_id` passam a ser ignorados; `POST /api/wallets` → 400 com carteira existente; `DELETE /api/wallets/:id` removida; `getOrCreateDefaultWallet` em service novo, chamado também no `createUser`. Pergunta de produto (P&L consolidado para legado com 2+ carteiras) registrada no `TODO-HUMANO.md`, default adotado.

### T-050a — Server: invariante de carteira única
- **Status**: PENDENTE (Onda 5)
- **Prioridade**: P1
- **Complexidade**: alta (auth/isolamento + validação de SELL; plano do spike no prompt)
- **Depende de**: T-043
- **Escopo**: Fases A1–A7 do plano do spike + docs de rotas. Retrocompatível: o web atual continua funcionando (só o form de criação da 2ª carteira passa a ver o 400).
- **Critério de aceite**: `POST /api/wallets` com carteira existente → 400; usuário novo nasce com carteira; `wallet_id`/`walletId` ignorados em operations/portfolio/import; SELL contra o consolidado; `import.test.ts` da T-019 convertido; suíte server verde.
- **Resultado**: —

### T-050b — Web: fluxo de carteira única
- **Status**: PENDENTE (Onda 5, após merge da T-050a)
- **Prioridade**: P1
- **Complexidade**: alta (refactor App/rotas/contexto; plano do spike no prompt)
- **Depende de**: T-050a
- **Escopo**: Fases B1–B8 + C do plano do spike. Remove `CarteirasPage`/`WalletSelector`/`walletChip` (decisão consciente de divergir do precedente T-026 — o humano pediu remoção da lógica). `/dash` sem param; `/dash/:id` e `/carteiras` → redirect.
- **Critério de aceite**: usuário novo opera sem nunca ver múltiplas carteiras; `walletFlow` reescrito com invariante da T-027 preservada; suítes e builds verdes.
- **Resultado**: —

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
- Editar template de recorrência (valor/dia — decisão de produto: afeta só futuras).
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
| 7 | Feedback do humano: renda variável, ocultar orçamento, logo clicável (+ arrumação docs/repo) | T-036 a T-038 | #77–#79 | 370+122 |
| 8 | Pedidos do humano pré-onda: landing c/ Despesas, simulador de rendimento, transferência poupança→meta, labels de renda | T-039 a T-042 | #80–#83 | 411+171 |
