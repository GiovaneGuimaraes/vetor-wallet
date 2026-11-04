# CLAUDE.md — @vetor-wallet/insights-core

Comparação da carteira com **CDI/Ibovespa** (T-068). Extraído de
`packages/rest-api/src/api/services/{benchmarks,benchmarkHistory,hourlyInsights}.ts`
na T-099c (Ciclo 19 — arquitetura em módulos). Categoria **Core**, módulo
**Insights** (ver `docs/MODULES.md` / `docs/PACKAGES.md`).

O **job de insights horários saiu na T-109a** (2026-09-20) — com ele saíram
`hourlyInsights.ts`, o CLI `insights:hourly` e a rota `POST /api/admin/run-insights-job`.
A tabela `hourly_quote_insights` continua no schema, **parada**: nada mais escreve nela, e
nada nunca leu (foi esse o argumento para remover). O fluxo volta como **Lambda + EventBridge**
quando a infra da AWS existir.

Não lê tabela nenhuma e **não importa nenhum outro core** (T-121): busca séries externas (BCB SGS 12 e brapi `^BVSP`) por `fetch` próprio.
O retorno da carteira e a data da 1ª operação — o lado "carteira" do `GET /api/benchmarks` — saíram daqui para o `portfolio-core`
(`getPortfolioReturnAndEarliestDate`), e a rota é quem junta os dois lados.

Este arquivo recebe a parte de Insights de `docs/decisions/snapshots-history.md`
(hoje um stub) — a parte de Portfolio daquele documento foi para
`packages/portfolio-core/CLAUDE.md`.

## Estrutura

**T-116b (passo 5 da migração AWS)**: formato-alvo inteiro — uma função por arquivo em `src/`, Jest em `tests/unit/tests/` com 100% travado (saiu o Vitest). Funções puras: `buildCdiIndexSeries`, `buildIbovespaSeries`, `clampSeriesToWindow`, `brapiRangeForDays`, `bcbDateToIso`, `isoToBcbDate`. Fetches externos: `fetchCDIAccumulated`/`fetchIbovespaReturn` (GET /api/benchmarks, UM número) e `fetchCdiSeries`/`fetchIbovespaSeries` (GET /api/benchmarks/history, série). Tipos em `types.ts`.

Rotas: `packages/rest-api/src/api/routes/benchmarks.ts`.
Lógica pura do cliente: `packages/web/src/routes/benchmarkSeries.ts`.

## Invariantes (não quebrar)

- **`GET /api/benchmarks` e `GET /api/benchmarks/history` são rotas DISTINTAS**,
  com shapes distintos (número × série). A antiga não pode virar série.
- **Fonte fora do ar devolve `null` para aquela série** — nunca derruba a
  request nem impede a outra série de aparecer (mesma política do
  `quotesUnavailable`).
- **A normalização base-100 → reais é do CLIENTE**, não daqui.

## Sem dependência de outro core (T-121)

Até a T-121 este package importava `buildPositionMap`/`buildPortfolioSummary` do `portfolio-core` (e `fetchQuotes` do
`brapi-core`) para calcular o retorno da carteira — **core → core de outro módulo**, contra a regra 6 de `docs/PACKAGES.md`.
**Decisão:** mover `getPortfolioReturnAndEarliestDate` para o `portfolio-core` (é dono de `operations` e da regra de preço
médio; o SQL e o cálculo são dele), com a cotação **injetada** (`fetchQuotes`, mesmo molde do `query`) para ele não ganhar
dependência de `brapi-core`. A rota `GET /api/benchmarks` chama os dois cores e monta o `BenchmarkData`. Corpo da resposta
inalterado. Não há mais `portfolio-core`/`brapi-core` em `dependencies` daqui.

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

### Por que o job de insights horários foi REMOVIDO (T-109a, 2026-09-20)
Ele gravava em `hourly_quote_insights` de hora em hora e **nenhum `SELECT` no repo lia essa
tabela** — escrita pura, sem leitor. Sem agendador de verdade, dependia de ser chamado à mão
(CLI) ou por cron do SO, e a rota de admin existia só para disparar o job a partir do navegador.
O humano decidiu (2026-09-20) tirá-lo do caminho **antes** da migração para a AWS, para que ele
renasça como Lambda + EventBridge em vez de ser carregado adiante e traduzido para Postgres sem
nunca ter tido um consumidor. A tabela continua no schema: derrubá-la é migração destrutiva e
tem tarefa própria (ver `docs/multi-agent/BACKLOG.md`).

## Convenções

- Testes em `tests/unit/tests/` (Jest, cobertura 100%); o `fetch` global é substituído por mock — nenhuma rede, nenhum banco.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência),
`docs/MODULES.md` (módulo Insights), `packages/portfolio-core/CLAUDE.md` e
`packages/brapi-core/CLAUDE.md`.
