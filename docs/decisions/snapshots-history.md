# Decisões: snapshots, histórico de preços e insights

> **Movido.** As decisões deste documento foram divididas por módulo na T-099c
> (Ciclo 19 — arquitetura em módulos):
>
> - Coleta diária de snapshots no boot (T-058a/T-063; o agendador in-process da
>   T-061 saiu na T-109b),
>   gráfico de evolução da carteira (T-058b) e preço por ação (T-060) vivem em
>   [`packages/portfolio-core/CLAUDE.md`](../../packages/portfolio-core/CLAUDE.md).
> - Comparação com CDI/Ibovespa (T-068) vive em
>   [`packages/insights-core/CLAUDE.md`](../../packages/insights-core/CLAUDE.md).
> - `DATABASE_URL` (default local, CLI, futuro Turso) vive em
>   [`packages/db/CLAUDE.md`](../../packages/db/CLAUDE.md).
