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

> **Ciclo 8 — pedidos do humano em 2026-07-25** (pré-"próxima onda"): landing com despesas, simulador de rendimento e transferência poupança→meta, labels de renda.

### T-039 — Landing: incluir Despesas nas explicações dos layers
- **Status**: CONCLUIDA
- **Prioridade**: P1
- **Complexidade**: baixa
- **Depende de**: —
- **Branch/worktree**: (worktree do executor)
- **Contexto**: pedido do humano — a landing (`AuthPage`) lista os layers em `FEATURES`, mas Despesas está diluída em "Renda e despesas".
- **Escopo**: `web/src/components/AuthPage.tsx` — separar em itens próprios: "Renda" (receitas-t.png) e "Despesas" (despesas-t.png, mascote já existe em `web/public/layers/`), com descrições curtas coerentes com o produto (despesas fixas + lançamentos variáveis com recorrência). Manter os demais itens.
- **Fora de escopo**: mudanças de layout/CSS além do necessário; outras páginas.
- **Critério de aceite**: item "Despesas" visível na landing com mascote próprio; `pnpm --filter vetor-wallet-web build` verde. Sem teste novo (mudança de copy/apresentação — política do CLAUDE.md).
- **Resultado**: PR #80 mergeada (2026-07-25). Executor Haiku, revisor Sonnet — APROVADA sem achados bloqueantes. Build verde.

### T-040 — Poupança: simulador de previsão de rendimento
- **Status**: CONCLUIDA
- **Prioridade**: P1
- **Complexidade**: alta (cálculo financeiro)
- **Depende de**: —
- **Branch/worktree**: (worktree do executor)
- **Contexto**: pedido do humano — "o user pode querer ver quanto que o dinheiro vai render em x tempo, ele vai escolher o tempo".
- **Escopo**: card "Previsão de rendimento" em `web/src/routes/PoupancaPage.tsx`. Inputs: valor inicial (default = saldo atual do `summary`), taxa mensal % (default derivada do histórico de YIELD quando possível, senão campo vazio com placeholder) e prazo em meses (escolhido pelo usuário). Saída: valor futuro (juros compostos), rendimento total. Lógica em função pura `web/src/routes/savingsProjection.ts` + testes (Vitest, casos de borda: prazo 0, taxa 0, entradas inválidas). Formatação pt-BR/BRL.
- **Fora de escopo**: nenhum endpoint novo; persistir simulações; comparação com CDI.
- **Critério de aceite**: `pnpm --filter vetor-wallet-web test` e build verdes; simulação puramente client-side.
- **Resultado**: PR #82 mergeada (2026-07-25). Executor Opus, revisor Opus — APROVADA, 0 bloqueantes, 4 sugestões (1 aplicada inline pelo orquestrador: redação da invariante de centavos; 3 registradas em Candidatas). 23 testes novos; suíte web 145 verde; build/lint verdes.

### T-041 — Poupança: transferir saldo da poupança para uma meta
- **Status**: PENDENTE (spike de design CONCLUÍDO — Plan/Opus; executa na Onda B, após merge da T-040 — mesmo arquivo)
- **Prioridade**: P1
- **Complexidade**: alta (dinheiro + possível mudança no server)
- **Depende de**: T-040
- **Branch/worktree**: —
- **Contexto**: pedido do humano — ao fazer um aporte numa meta, o usuário deve poder tirar o dinheiro da poupança que está rendendo para colocar na meta.
- **Escopo** (definido pelo spike Plan/Opus): endpoint novo `POST /api/savings/transfer-to-goal` criando par atômico WITHDRAW (sem vínculo) + DEPOSIT (vinculado), mesmo `transfer_group` (UUID, coluna nova via ALTER idempotente), via `db.batch`; validação contra **saldo livre** (saldo − reservado por metas, piso 0, comparação em centavos); `SavingsSummary` inalterado; UI: card "Transferir para uma meta" + 4º card "Saldo livre" + selo ⇄ nas duas pernas + aviso para meta MANUAL com valor > 0; pernas independentes após criadas (sem cascata). Helpers duplicados de propósito server/web (padrão T-028).
- **Fora de escopo**: rateio de rendimento por meta; desfazer/cascatear; transferir de volta; mudar `SavingsSummary`.
- **Critério de aceite**: par atômico criado; saldo total inalterado e saldo livre reduzido; progresso da meta sobe o valor; 400 saldo livre insuficiente sem gravar nada; 404 meta de outro usuário; suítes server+web e build verdes; `CLAUDE.md` atualizado.
- **Resultado**: —

### T-042 — Renda: renomear labels das seções mensais
- **Status**: CONCLUIDA
- **Prioridade**: P2
- **Complexidade**: baixa
- **Depende de**: —
- **Branch/worktree**: (worktree do executor)
- **Contexto**: pedido do humano — nomes mais claros para as duas seções de `/renda`.
- **Escopo**: `web/src/routes/RendaPage.tsx` — "Fontes fixas" → "Renda fixa do mês" (título da seção, linha ~426; ajustar também o subtitle da página, linha ~391, e comentários se citarem os nomes antigos) e "Rendas do mês" → "Renda variável do mês" (linha ~588).
- **Fora de escopo**: qualquer mudança de comportamento/API.
- **Critério de aceite**: labels novas renderizadas; build web verde. Sem teste novo (copy).
- **Resultado**: PR #81 mergeada (2026-07-25). Executor Haiku, revisor Sonnet — APROVADA sem achados bloqueantes. Build verde (rodado pelo executor).

## Em espera (decisão do humano — ver `TODO-HUMANO.md`)

### T-020 — Logo oficial no header e na AuthPage
- **Status**: PENDENTE — decisão de UX pendente: mascotes vs logo oficial no header (favicon/head já entregues na T-018).

### T-021 — Validação de SELL por data histórica
- **Status**: PENDENTE — avaliar custo/benefício (SELL retroativo é validado contra a posição de hoje; documentado como decisão consciente no `CLAUDE.md`).

## Candidatas (não urgentes, colhidas das revisões dos ciclos 5–8)

- Simulador T-040 (sugestões do revisor Opus): curto-circuito `initial === 0` (hoje 0 × taxa extrema → null); defaults dos inputs exibidos com vírgula/2 casas (`toFixed(2).replace('.', ',')`); excluir o mês corrente (incompleto) da amostra de `deriveMonthlyRatePct`. Projeção com aporte mensal recorrente + comparação com CDI (sugestão do executor).

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
