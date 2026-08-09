# CLAUDE.md — @vetor-wallet/insights-core

Comparação da carteira com **CDI/Ibovespa** (T-068) e o **job de insights
horários**. Extraído de
`packages/rest-api/src/api/services/{benchmarks,benchmarkHistory,hourlyInsights}.ts`
na T-099c (Ciclo 19 — arquitetura em módulos). Categoria **Core**, módulo
**Insights** (ver `docs/MODULES.md` / `docs/PACKAGES.md`).

É dono de `hourly_insights` e por isso importa `@vetor-wallet/db`; busca séries
externas (BCB SGS 12 e brapi `^BVSP`) e por isso importa
`@vetor-wallet/brapi-core`.

Este arquivo recebe a parte de Insights de `docs/decisions/snapshots-history.md`
(hoje um stub) — a parte de Portfolio daquele documento foi para
`packages/portfolio-core/CLAUDE.md`.

## Estrutura

```
src/
├── benchmarks.ts         # GET /api/benchmarks: UM número por benchmark
│                         # (acumulado do período inteiro da carteira)
├── benchmarkHistory.ts   # GET /api/benchmarks/history: SÉRIE diária.
│                         # buildCdiIndexSeries/buildIbovespaSeries/
│                         # clampSeriesToWindow/brapiRangeForDays são puras
├── hourlyInsights.ts     # job de insights horários (PQueue + withRetry)
└── index.ts              # barrel
```

Rotas: `packages/rest-api/src/api/routes/{benchmarks,admin}.ts`.
CLI: `packages/cli/src/hourlyInsights.ts` (`pnpm --filter vetor-wallet-cli insights:hourly`).
Lógica pura do cliente: `packages/web/src/routes/benchmarkSeries.ts`.

## Invariantes (não quebrar)

- **`GET /api/benchmarks` e `GET /api/benchmarks/history` são rotas DISTINTAS**,
  com shapes distintos (número × série). A antiga não pode virar série.
- **Fonte fora do ar devolve `null` para aquela série** — nunca derruba a
  request nem impede a outra série de aparecer (mesma política do
  `quotesUnavailable`).
- **A normalização base-100 → reais é do CLIENTE**, não daqui.

## Dependência de `@vetor-wallet/portfolio-core` (nota de arquitetura)

`src/benchmarks.ts` usa `buildPositionMap`/`buildPortfolioSummary` e
`hourlyInsights.ts` usa `resolveActiveTickers`/`getBRTDate`/
`saveSnapshotForDate`/`withRetry`. Isso é **core → core de outro módulo**,
contra a regra 6 de `docs/PACKAGES.md`. É o acoplamento que já existia dentro do
`server` (`services/benchmarks.ts` importava `./portfolio`), apenas tornado
explícito pela extração — a T-099c foi movimentação mecânica e **não** o
desfez. Desacoplar (ex.: a rota passar o `PortfolioSummary` pronto, e os helpers
de BRT/retry saírem para um transversal) é candidato a tarefa futura.

## Decisões: benchmarks e insights

### Comparação com CDI/Ibovespa no gráfico de evolução (T-068)

Duas linhas OPCIONAIS no `HistoryChart`, respondendo "e se o mesmo dinheiro tivesse ido pro benchmark?". Toggles independentes (`showCdi`/`showIbov`, pílulas `.vw-history-window-btn` com `aria-pressed`) ao lado do seletor de janela; legenda lista só as séries efetivamente desenhadas.

- **Rota nova, não a `GET /api/benchmarks`**: a rota antiga devolve UM número por benchmark (acumulado do período inteiro da carteira) — não dá para desenhar uma linha com isso, e mudar o shape dela quebraria seu contrato. Entrou `GET /api/benchmarks/history?days=N`, mesma janela/limites (1..365, default 90) e a MESMA âncora de hoje (data BRT) do `/api/portfolio/history`, para que os dois `fetch` cubram exatamente o mesmo período. A regra de parse do `?days=` virou `parseDaysParam` (`@vetor-wallet/validation-core`) e agora é compartilhada pelas duas rotas em vez de reescrita em cada uma.
- **Fontes**: as mesmas de `src/benchmarks.ts` — BCB SGS 12 (taxas DIÁRIAS do CDI) e brapi `^BVSP`, agora com `interval=1d` e `range` derivado da janela (`brapiRangeForDays`). Timeout de 5s e `null` por série em qualquer falha (HTTP, timeout, JSON inesperado, período sem dado): uma fonte fora do ar não impede a outra de aparecer nem derruba a request — mesma política do `quotesUnavailable`. A parte pura (`buildCdiIndexSeries`, `buildIbovespaSeries`, `clampSeriesToWindow`) está em `src/benchmarkHistory.ts`, testada.
- **CDI vira índice acumulado, não taxa**: `buildCdiIndexSeries` multiplica as taxas diárias em um índice base 100. O valor absoluto da base é irrelevante — o cliente reancora tudo; o que importa é que a razão entre dois pontos é a rentabilidade correta do intervalo.
- **Normalização é do CLIENTE** (`packages/web/src/routes/benchmarkSeries.ts`, testado): só ele sabe a janela exibida e o valor da carteira no dia de partida. A base-100 é expressa **em reais** — cada série é reancorada no primeiro dia comparável da janela e escalada para valer, ali, exatamente o valor da carteira. As três linhas saem do mesmo ponto e a distância vertical entre elas é dinheiro de verdade; assim tudo cabe no MESMO eixo Y em BRL, sem um segundo eixo em índice (que seria ilegível e faria a área da carteira perder sentido).
- **Buracos de data — forward-fill, e nada de back-fill**: CDI/Ibovespa só têm dado em dia útil, e a série da carteira pode ter pontos em dias sem fechamento. Buraco no meio (ou no fim) repete o último valor conhecido — **mesma escolha e mesmo motivo do forward-fill de preços da T-058a**; interpolar linearmente inventaria movimento que não existiu. Buraco no INÍCIO fica `null`: se a fonte só começa no meio da janela não há de onde puxar valor para trás, então a linha simplesmente começa depois e a âncora da base passa a ser esse primeiro dia comparável (as linhas continuam se encontrando ali). `splitSegments` quebra a linha em vários `path` para que o vazio não seja atravessado por uma reta inventada.
- **Casos de borda cobertos por teste**: janela parcial, série vazia/ausente, benchmark inteiramente posterior à janela, tamanhos divergentes e **âncora igual a zero** (divisão por zero no ponto de partida) — todos devolvem `null`, e a UI então não desenha a linha e mostra "sem dados de benchmark para este período".
- **Domínio do eixo Y**: `computeHistoryDomain` ganhou um segundo parâmetro `extraValues` (default `[]`, retrocompatível) com os valores das linhas visíveis — sem isso um benchmark que rendeu mais que a carteira sairia do desenho. Ligar/desligar uma série muda o domínio, e é intencional.
- **Cores**: `--color-bench-cdi` / `--color-bench-ibov` (novas, em `index.css`, inalteradas entre temas como up/down/warn) — identidade de SÉRIE, não sentimento: não podiam reusar up/down (que já significam alta/baixa da carteira) nem `--color-dim` (a linha de custo). Nenhuma cor literal no componente.
- **Fetch só quando algum toggle está ligado**, com a mesma guarda de resposta obsoleta (`benchmarkRequestRef`); a resposta traz as DUAS séries, então ligar/desligar depois é só render, sem refetch.
- **Tooltip (T-067)** ganhou linha por benchmark visível (valor no MESMO dia), e cresce em altura/largura conforme as linhas presentes.
- **Fora de escopo (segue pendente)**: exportação do gráfico; comparação com outros benchmarks (IPCA, dólar); percentuais de rentabilidade lado a lado (as linhas comparam valor, não mostram "+X% vs +Y%").

### Job de insights horários sem agendador automático
O CLI `pnpm --filter vetor-wallet-cli insights:hourly` precisa ser invocado manualmente ou via cron do SO até o deploy em AWS Lambda + EventBridge (issue futura).

## Convenções

- Teste ao lado do código (`src/**/*.test.ts`), Vitest. Teste que toca banco
  define `DATABASE_URL` **antes** do `await import('@vetor-wallet/db')` — o
  client lê o env no top-level do módulo.
- `src/benchmarks.ts` **não tem teste próprio** (é orquestração de dois fetches
  externos + `buildPortfolioSummary`, que já é testado em `portfolio-core`);
  a parte pura de séries está coberta em `benchmarkHistory.test.ts`.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência),
`docs/MODULES.md` (módulo Insights), `packages/portfolio-core/CLAUDE.md` e
`packages/brapi-core/CLAUDE.md`.
