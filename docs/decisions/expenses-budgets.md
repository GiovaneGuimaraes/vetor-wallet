# Decisões: despesas, recorrência, categorias e orçamento

> **Movido.** As decisões deste domínio vivem agora em
> [`packages/expenses-core/CLAUDE.md`](../../packages/expenses-core/CLAUDE.md)
> (T-099b, Ciclo 19 — arquitetura em módulos). Leia lá antes de mexer no módulo
> Expenses: fixas × variáveis, recorrência lazy/idempotente (T-035), histórico
> mensal (T-033/T-049), orçamento por categoria (T-023/T-037/T-082/T-089),
> categoria normalizada (T-028), edição inline (T-031), dedupe de fetch (T-049),
> dedupe de importação por `external_id` (T-084) e importação de extrato OFX
> (T-085/T-086).

As seções de `external_id` e OFX migram de novo para `packages/bank-import-core`
na T-099c; `normalizeCategory` já vive em
[`packages/validation-core/CLAUDE.md`](../../packages/validation-core/CLAUDE.md)
desde a T-099a.
