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

_(vazio — Ciclo 15 CONCLUÍDO E MERGEADO em 2026-08-01, PRs #115–#119. Detalhes no `BACKLOG-ARQUIVO.md`. Aguardando direcionamento do humano para o ciclo 16.)_

## Em espera (decisão do humano — ver `TODO-HUMANO.md`)

### T-020 — Logo oficial no header e na AuthPage
- **Status**: PENDENTE — decisão de UX pendente: mascotes vs logo oficial no header (favicon/head já entregues na T-018).

### T-021 — Validação de SELL por data histórica
- **Status**: PENDENTE — avaliar custo/benefício (SELL retroativo é validado contra a posição de hoje; documentado como decisão consciente no `CLAUDE.md`).

## Candidatas (não urgentes)

> As colheitas dos ciclos 9 e 10 foram resolvidas pelas tarefas T-051–T-055 (Ciclo 10). Abaixo, só o que segue aberto.

- Comparação com CDI/Ibovespa em outros pontos (simulador da poupança, projeções de aporte, card resumo) — o humano aprovou a opção do gráfico de evolução (T-068); as demais ficam como extensão futura.
- Editar template de recorrência (valor/dia — decisão de produto: afeta só futuras).
- `current_amount` manual obsoleto ao desvincular o último lançamento de uma meta (semântica a decidir).
- Threshold percentual de 2 casas a revisitar com a UI de alertas (demais sobras das revisões 10–11 entraram no Ciclo 14: T-064–T-067).
- Backfill histórico de snapshots via `hourly_quote_insights` (o agendador in-process foi entregue na T-061; Lambda/EventBridge segue como dívida de produção).
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
| 11 | Histórico real da carteira (coleta no boot + /portfolio/history + gráfico de evolução) + colheita do ciclo 10 | T-058a/b, T-059 | #103–#105 | 532+263 |
| 12 | Preço por ação ao longo do tempo (seletor de ticker + referência do preço médio) | T-060 | #106 | 532+283 |
| 13 | Agendador in-process da coleta de snapshots + aporte mensal nas projeções + colheita da T-058a | T-061 a T-063 | #107–#109 | 537+309 |
| 14 | Colheita (índice, sobras server, charts) + tooltips + benchmarks CDI/IBOV no gráfico | T-064 a T-068 | #110–#114 | 565+351 |
| 15 | Monetização: AbacatePay (Pix), planos, gating por assinatura, staging sem pagamento | T-069 a T-073 | #115–#119 | 650+373 |
