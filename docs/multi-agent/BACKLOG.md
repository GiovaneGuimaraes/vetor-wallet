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

_(vazio — Ciclo 7 CONCLUÍDO E MERGEADO em 2026-07-25, PRs #77–#79. Detalhes no `BACKLOG-ARQUIVO.md`. T-020/T-021 seguem em espera por decisão do humano.)_

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
| 7 | Feedback do humano: renda variável, ocultar orçamento, logo clicável (+ arrumação docs/repo) | T-036 a T-038 | #77–#79 | 370+122 |
