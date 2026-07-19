# Sistema multi-agente — Vetor Wallet

Este diretório define o fluxo de trabalho multi-agente em loop fechado do projeto. **Todo agente (orquestrador ou executor) deve ler este arquivo antes de qualquer tarefa.**

## Papéis

| Papel | Modelo | Quem é | Responsabilidade |
|---|---|---|---|
| **Orquestrador** | Fable (sessão principal do Claude Code) | Você, se está lendo isto na sessão principal | Entender o app, priorizar, decompor trabalho em TODOs no `BACKLOG.md`, delegar aos executores, revisar e integrar resultados |
| **Executor** | Sonnet (subagente `executor`) | Subagente criado via ferramenta Agent | Implementar UMA tarefa do backlog, com testes, em worktree isolado |
| **Revisor** | Sonnet (subagente `revisor`) | Subagente criado via ferramenta Agent | Revisar o diff de uma tarefa concluída antes da integração |
| **Humano** | Giovane | Dono do projeto | Decisões de produto, aprovação de merges, itens do `TODO-HUMANO.md` |

## Documentos do sistema

| Arquivo | Dono da escrita | Conteúdo |
|---|---|---|
| [`ORQUESTRADOR.md`](./ORQUESTRADOR.md) | Humano (atualizado pelo orquestrador com aprovação) | Contexto do app e prioridades atuais — leitura inicial obrigatória do orquestrador |
| [`BACKLOG.md`](./BACKLOG.md) | Orquestrador | TODOs decompostos, com status e branch de cada tarefa |
| [`TODO-HUMANO.md`](./TODO-HUMANO.md) | Executores e orquestrador | Pendências que só o humano pode resolver (decisões, credenciais, aprovações) |
| `../../CLAUDE.md` | Humano | Arquitetura, comandos, convenções e política de testes — leitura obrigatória de todos |

## O loop fechado

```
┌─────────────────────────────────────────────────────────┐
│ 1. PLANEJAR (orquestrador / Fable)                       │
│    Lê ORQUESTRADOR.md + CLAUDE.md + BACKLOG.md           │
│    Cria/atualiza TODOs no BACKLOG.md com prioridade      │
│                        │                                 │
│ 2. DELEGAR (orquestrador)                                │
│    Para cada TODO pronto: spawn de subagente `executor`  │
│    com isolation: worktree (branch própria por tarefa).  │
│    Tarefas independentes rodam em paralelo.              │
│                        │                                 │
│ 3. EXECUTAR (executor / Sonnet)                          │
│    Implementa a tarefa + testes no worktree isolado.     │
│    Bloqueou em decisão humana? → registra no             │
│    TODO-HUMANO.md e devolve status BLOQUEADA.            │
│                        │                                 │
│ 4. REVISAR (revisor / Sonnet, spawn do orquestrador)     │
│    Revisa o diff: corretude, testes, convenções do       │
│    CLAUDE.md. Reprovou? → volta ao passo 3 com feedback. │
│                        │                                 │
│ 5. INTEGRAR (orquestrador)                               │
│    Atualiza status no BACKLOG.md, consolida resultados,  │
│    reporta ao humano. Merge/PR só com aprovação humana.  │
│                        │                                 │
│ 6. FECHAR O LOOP                                         │
│    Orquestrador reavalia prioridades com o que aprendeu  │
│    e volta ao passo 1.                                   │
└─────────────────────────────────────────────────────────┘
```

## Regras de paralelismo (multi-branch)

- Cada tarefa delegada roda com **`isolation: "worktree"`** na ferramenta Agent — o executor recebe um git worktree próprio e não conflita com outros executores.
- O orquestrador só paraleliza tarefas **sem dependência entre si** (marcadas no `BACKLOG.md`). Tarefas que tocam os mesmos arquivos rodam em série.
- Alternativa manual (fora do Claude Code): `git worktree add ../vetor-wallet-<tarefa> -b feat/<tarefa>` e uma sessão `claude` em cada diretório.

## Regras de comunicação

- **Executores nunca perguntam ao humano diretamente** — registram a dúvida no `TODO-HUMANO.md` e devolvem a tarefa como `BLOQUEADA` com o motivo.
- **Executores devolvem dados, não prosa** — o retorno final do subagente deve dizer: o que foi feito, arquivos alterados, testes rodados (comando + resultado), e pendências.
- **O orquestrador é o único que escreve no `BACKLOG.md`** — executores reportam; orquestrador atualiza status. Evita conflito de escrita entre worktrees.
- Toda mudança de produto segue a **política de testes do CLAUDE.md**: teste automatizado ou justificativa explícita.

## Estados de uma tarefa

`PENDENTE` → `EM_ANDAMENTO` → (`BLOQUEADA` ⇄) → `EM_REVISAO` → `CONCLUIDA` | `CANCELADA`
