# Backlog de tarefas — escrito pelo orquestrador

> Somente o orquestrador escreve aqui (ver regras em `README.md`). Executores reportam no retorno do subagente; o orquestrador atualiza este arquivo.
>
> Estados: `PENDENTE` → `EM_ANDAMENTO` → (`BLOQUEADA`) → `EM_REVISAO` → `CONCLUIDA` | `CANCELADA`

## Modelo de tarefa

```markdown
### T-001 — Título curto e imperativo
- **Status**: PENDENTE
- **Prioridade**: P1 | P2 | P3
- **Depende de**: — (ou T-xxx; tarefas com dependência não paralelizam)
- **Branch/worktree**: (preenchido ao delegar)
- **Contexto**: por que esta tarefa existe; link para prioridade no ORQUESTRADOR.md
- **Escopo**: o que fazer, arquivos-alvo prováveis
- **Fora de escopo**: o que NÃO fazer
- **Critério de aceite**: verificável — "dado X, quando Y, então Z" + comando de teste
- **Resultado**: (preenchido ao concluir: resumo, arquivos, testes rodados)
```

---

## Tarefas ativas

_(vazio — o orquestrador popula a partir das prioridades do `ORQUESTRADOR.md`)_

## Concluídas

_(mover para cá com o campo Resultado preenchido)_
