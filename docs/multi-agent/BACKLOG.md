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

_(vazio — Ciclo 9 CONCLUÍDO E MERGEADO em 2026-07-25, PRs #84–#92. Detalhes no `BACKLOG-ARQUIVO.md`. T-020/T-021 seguem em espera por decisão do humano; item aberto no `TODO-HUMANO.md`: P&L consolidado para base legada com 2+ carteiras — default adotado na T-050.)_

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
