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
- **Status**: PENDENTE (Onda 2)
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
- **Status**: PENDENTE (Onda 2)
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
- **Status**: PENDENTE (Onda 3)
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
- **Status**: PENDENTE (Onda 4)
- **Prioridade**: P1
- **Complexidade**: média (transversal, toca dinheiro → revisor opus)
- **Depende de**: T-044, T-045, T-048, T-049 (mesmos arquivos de rotas — roda depois dos merges)
- **Branch/worktree**: —
- **Contexto**: candidata das revisões — `DATE_RE` valida só o formato; `2026-13-45` é aceito e gravado.
- **Escopo**: helper único de validação de data real (calendário, com meses curtos/bissexto) em `server/src/services/`, aplicado a POST **e** PATCH de todas as rotas com `date`: operations, income-entries, expense-entries, savings, transfer-to-goal, import CSV. `400` para data inexistente. Testes por rota (ao menos um caso inválido por endpoint) + testes do helper.
- **Fora de escopo**: rejeitar data futura (o app aceita por decisão); normalizar dados legados.
- **Critério de aceite**: `2026-02-30`/`2026-13-01` → `400` em todas as rotas com data; suíte server verde.
- **Resultado**: —

### T-050 — Carteira única: remover a lógica de múltiplas carteiras
- **Status**: PENDENTE (Onda 5 — por último, pedido do humano)
- **Prioridade**: P1
- **Complexidade**: alta (auth/isolamento + fluxo de operações/validação de SELL; spike de design recomendado)
- **Depende de**: todas as anteriores do ciclo
- **Branch/worktree**: —
- **Contexto**: decisão do humano (2026-07-25, via chat; já sinalizada em 2026-07-24): "na parte de carteira de ações eu quero remover a lógica que permite o user ter mais de uma carteira no momento".
- **Escopo**: impedir mais de uma carteira por usuário (server: `POST /api/wallets` responde `400` quando já existe uma; garantir/auto-criar a carteira padrão) e simplificar o web para o fluxo de carteira única (remover seletor/página de gerenciamento de múltiplas carteiras; operações sempre na carteira única). Definir no spike o tratamento de dados legados com múltiplas carteiras (não destruir dados). Testes server + web.
- **Fora de escopo**: remover `wallet_id` do schema (fica para reversibilidade); migração destrutiva de dados; mexer em cripto.
- **Critério de aceite**: usuário novo opera sem nunca ver conceito de múltiplas carteiras; `POST /api/wallets` com carteira existente → `400`; suítes e build verdes.
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
