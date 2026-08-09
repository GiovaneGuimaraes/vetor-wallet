# CLAUDE.md — @vetor-wallet/portfolio-core

Carteira e ações da B3: posição por **preço médio ponderado**, validação de SELL
contra a posição atual, série histórica valor × custo, snapshots diários de
fechamento e o agendador in-process da coleta. Extraído de
`packages/rest-api/src/api/services/{portfolio,portfolioHistory,wallets,snapshots,snapshotScheduler}.ts`
na T-099c (Ciclo 19 — arquitetura em módulos). Categoria **Core**, módulo
**Portfolio** (ver `docs/MODULES.md` / `docs/PACKAGES.md`).

É dono das tabelas `wallets`, `operations` e `quote_snapshots`, e por isso
importa `@vetor-wallet/db` — "Core" é *dono das regras/dados do domínio*, não
*nunca faz I/O*.

Este arquivo substitui `docs/decisions/wallets-portfolio.md` e a parte de
Portfolio de `docs/decisions/snapshots-history.md` (ambos hoje stubs apontando
para cá) e cobre o módulo inteiro, incluindo o que vive nas rotas do `server` e
nas telas do `web`. As seções de benchmarks (T-068) e do job de insights
horários foram para `packages/insights-core/CLAUDE.md`.

## Estrutura

```
src/
├── portfolio.ts          # applyOperation (preço médio ponderado),
│                         # buildPositionMap, getPositionQuantity,
│                         # wouldExceedPosition, computeDayProfitLoss,
│                         # buildPortfolioSummary  — TUDO puro, sem I/O
├── portfolioHistory.ts   # shiftDate, buildDateWindow, buildPortfolioHistory
│                         # (forward-fill + positionMap incremental) — puro
├── wallets.ts            # DEFAULT_WALLET, findDefaultWallet, countWallets,
│                         # withUserLock, getOrCreateDefaultWallet (SQL)
├── snapshots.ts          # getBRTDate/isBusinessDay/withRetry (puros) +
│                         # persistência e leitura de quote_snapshots +
│                         # runSnapshotJob / catchUpIfNeeded
├── snapshotScheduler.ts  # startSnapshotScheduler (setInterval + unref)
└── index.ts              # barrel
```

Rotas: `packages/rest-api/src/api/routes/{wallets,operations,portfolio,snapshots,import,alerts}.ts`.
Boot: `packages/rest-api/src/api/index.ts` chama `catchUpIfNeeded()` e
`startSnapshotScheduler(30min, catchUpIfNeeded)` — ver "Coleta diária" abaixo.
Telas: `packages/web/src/routes/DashboardPage.tsx` e os módulos puros ao lado.

## Invariantes (não quebrar)

- **Preço médio ponderado**: `applyOperation` é a ÚNICA implementação da regra —
  BUY recalcula a média, SELL reduz quantidade **sem** alterar o preço médio.
  `buildPositionMap`, `buildPortfolioHistory` e a validação de SELL passam todos
  por ela; nunca duplique a fórmula.
- **Carteira ÚNICA por usuário** (T-050): `POST /api/wallets` recusa a segunda;
  `walletId` vindo do cliente é sempre ignorado.
- **Falha de cotação nunca derruba a request** — degrada em
  `quotesUnavailable`.
- **A coleta de snapshots só é idempotente por causa do banco**
  (`UNIQUE(ticker, date(captured_at))`) somado às guardas de `catchUpIfNeeded`.
  Não invente guarda nova.
- **`snapshots.ts` tem `fetchQuotesStrict` PRÓPRIO** (que *lança* em erro, para o
  `withRetry` agir), separado do `fetchQuotes` de `@vetor-wallet/brapi-core` (que
  degrada em silêncio). São contratos de erro opostos de propósito; este package
  **não** importa `brapi-core` hoje. Ver "Pendências".

## Decisões: carteira, ações e dashboard

### Carteira única de ações (T-050 server, T-050b web)
Decisão do humano (2026-07-25): "remover a lógica que permite o user ter mais de uma carteira". O modelo adotado é **"escopo = usuário; a carteira virou só um rótulo"** — nada é apagado nem escondido.

- **`POST /api/wallets` recusa a segunda carteira** com `400` (a validação de `name` continua vindo antes). O usuário já **nasce** com a carteira padrão: `createUser` (`@vetor-wallet/auth-core`) chama `getOrCreateDefaultWallet`, e uma falha ali é logada mas **não derruba o registro** — o lazy-create do `GET /api/wallets` segue como rede de segurança.
- **`DELETE /api/wallets/:id` foi removido** (nenhum cliente o usava; a FK de `operations` impediria apagar uma carteira com histórico de qualquer forma).
- **A invariante é de aplicação, não de banco**: **não** existe índice `UNIQUE(user_id)` em `wallets` — ele quebraria o boot de uma base legada que já tem 2+. Essas carteiras continuam existindo e sendo **listadas** pelo `GET`; o que muda é que nenhuma leitura filtra por elas e nenhuma nova pode ser criada.
- **Semântica do legado**: as leituras (`GET /api/operations`, `GET /api/portfolio`) agregam **todas** as operações do usuário. Numa base com 2+ carteiras, o P&L exibido passa a ser o **consolidado** delas — nenhuma operação some, mas o número muda. A alternativa (mostrar só a carteira mais antiga) esconderia operações reais e foi rejeitada; a decisão está registrada no `TODO-HUMANO.md`.
- **`walletId`/`wallet_id` do cliente é ignorado** nas três rotas de dados (query string em operations/portfolio/import, body em `POST /api/operations`). Isso é retrocompatível — o web atual continua funcionando enviando o parâmetro — e fecha de quebra um buraco: o `wallet_id` do body era gravado sem checagem de posse, então dava para registrar uma operação numa carteira de **outro** usuário.
- **`packages/portfolio-core/src/wallets.ts`** concentra `DEFAULT_WALLET`, `findDefaultWallet` (mais antiga: `ORDER BY created_at ASC, id ASC` — desempate por `id` porque `created_at` tem resolução de segundos), `countWallets` e `getOrCreateDefaultWallet`. Este último também adota as operações órfãs (`UPDATE operations SET wallet_id = ? WHERE user_id = ? AND wallet_id IS NULL`, dado de antes de `wallets` existir) e relê a mais antiga depois do INSERT, para que dois requests simultâneos convirjam para a mesma carteira em vez de cada um usar a sua.
- **`POST /api/wallets` cria via `getOrCreateDefaultWallet(userId, overrides)` (T-053)**, em vez de um `INSERT` próprio: o `overrides` opcional (`{ name, description, color }`) substitui `DEFAULT_WALLET` já no INSERT do service, então a rota volta com a carteira do body **e** com a adoção de operações órfãs num único caminho — sem UPDATE depois de criar (a janela create→UPDATE não tinha reparo: uma falha no meio deixaria a carteira parada no nome default, sem nenhum `PATCH /api/wallets` para corrigi-la). `GET /api/wallets` e `createUser` continuam chamando sem `overrides` (comportamento inalterado: sempre `DEFAULT_WALLET`). Na corrida de dois `POST` simultâneos, o primeiro `INSERT` a rodar vence — é o que `findDefaultWallet` releria como mais antigo — e o corpo do segundo perde (o perdedor deixa a carteira órfã já documentada no JSDoc de `getOrCreateDefaultWallet`, agora também com o nome do corpo perdedor descartado). O handler joga (`throw`) um erro explícito se o `SELECT` final não encontrar a linha recém-criada, em vez de responder `200`/`201` com corpo `undefined`.

**A metade web (T-050b)** — o usuário deixou de ver o conceito de "várias carteiras" em qualquer lugar da UI:

- **Nenhuma chamada de API manda carteira.** `getOperations`/`createOperation`/`getPortfolio`/`importCsv` (`packages/web/src/api.ts`) perderam o parâmetro `walletId?` e o `wallet_id` do body. `getWallets`/`createWallet` **ficam** — é por elas que o rótulo chega e que o auto-create de exceção acontece.
- **O `ShellContext` virou singular**: `wallet: Wallet | null` e `walletSummary: PortfolioSummary | null` no lugar de `wallets: Wallet[]`/`walletSummaries: Record<number, …>`; `onSelectWallet`/`onCreateWallet` saíram (não há mais tela que os dispare). `refreshWallet` faz `getWallets()` → `resolvePrimaryWallet` → **um** `getPortfolio()` — antes era um portfolio por carteira em `Promise.allSettled`. O `getPortfolio` vai em `try` próprio: falhar a cotação não invalida o rótulo que acabou de carregar.
- **`decideWalletFlow` (`packages/web/src/routes/walletFlow.ts`) foi reescrita** de "criar/redirecionar/listar/erro" para um estado de carteira única: `(wallet, loaded, hadLoadError) → 'loading' | 'error' | 'create' | 'ready'`. **A invariante da T-027 foi preservada**: `hadLoadError && !wallet` ⇒ `'error'`, **nunca** `'create'` — `wallet === null` por falha de rede é indistinguível de "usuário sem carteira", e criar automaticamente nesse caso mascararia a carteira real atrás de uma "Principal" espúria (achado bloqueante do revisor na T-027). Se já há carteira de uma carga anterior, uma falha seguinte não é ambígua → `'ready'`.
- **`resolvePrimaryWallet(wallets)`** (mesmo arquivo, função pura testada) é o espelho no web do `findDefaultWallet` do server: a carteira é a de **menor `id`** (monotônico ⇒ a mais antiga; não depende da ordem em que a lista chegou, e evita o `created_at` de resolução de segundos). Numa base legada com 2+ carteiras isso escolhe **só o rótulo** — o dashboard segue mostrando o consolidado, porque o server agrega por usuário.
- **O auto-create foi internalizado em `App.tsx`** (com o `creatingRef` que vivia na `CarteirasPage`, contra loop de POSTs enquanto a criação está em voo). É caminho de exceção: desde a T-050a o `createUser` já cria a padrão e o `GET /api/wallets` faz lazy-create, então usuário novo chega em `'ready'` sem criar uma segunda.
- **Rotas**: `/dash` (sem param) é o dashboard. `/dash/:id` e `/carteiras` respondem `<Navigate to="/dash" replace />` — bookmarks antigos não quebram. O card "Ações" da Home aponta para `/dash`.
- **`DashboardPage` sem `useParams`**: a carteira vem do contexto e o chip do topo virou **rótulo estático** (nome + cor, sem `onClick`) — não há para onde trocar. O estado `'error'` mostra um "Tentar novamente" (`refreshWallet`) ao lado do rótulo, mas **não bloqueia** o resto da tela: operações e portfolio são do usuário e não dependem do rótulo ter carregado.
- **Arquivos removidos**: `routes/CarteirasPage.tsx`, `components/WalletSelector.tsx`, `components/walletChip.ts(+test)` e as regras `.wallet-selector-*` de `App.css`. Divergência **consciente** do precedente da T-026 ("tirar do render, manter o arquivo"): ali a UI podia voltar num redesign; aqui o humano pediu a remoção da *lógica* multi-carteira, e o git preserva a história.
- **Fora de escopo**: remover `wallet_id` do schema, qualquer migração destrutiva do legado, e tirar `Wallet`/`NewWallet` de `shared/` (ainda usados por `getWallets`/`createWallet`).

### Validação de SELL contra a posição atual
`POST /api/operations` e `POST /api/import` (CSV) rejeitam com `400` qualquer SELL que exceda a posição consolidada **atual** do ticker **do usuário** — soma de todas as operações já registradas por ele, sem nenhum filtro de carteira (T-050), e independente da data da nova operação; não há validação por data histórica, um SELL retroativo é validado contra a posição de hoje. Numa base legada com 2+ carteiras, um SELL coberto pela **soma** delas é aceito (antes da T-050 era rejeitado por não caber na carteira alvo) — coerente com o escopo virar o usuário. A checagem usa `wouldExceedPosition`/`getPositionQuantity` em `packages/portfolio-core/src/portfolio.ts`, reaproveitando o mesmo `buildPositionMap` do cálculo de preço médio (sem duplicar lógica). No CSV, a rejeição é **por linha**: linhas de SELL inválidas entram no relatório de erros (`CsvImportResult.errors`, com número da linha) e o restante do arquivo é importado normalmente. `applyOperation` mantém `Math.max(0, newQty)` como cláusula de defesa (não como validação) — dados históricos podem já conter vendas a descoberto gravadas antes desta validação existir, e o cálculo de posição não pode quebrar/ficar negativo ao processá-los.

### Projeção de ganhos na dash de ações (T-056)
O card "Projeção de ganhos" em `/dash`, entre `PortfolioDashboard` e `OperationsList`, simula juros compostos mensais sobre o valor de mercado atual da carteira — mesmo precedente **client-side sem persistência** da T-040 (previsão de rendimento da poupança): nenhum endpoint novo, tudo calculado no browser.

- **Módulo puro**: `packages/web/src/routes/portfolioProjection.ts` (T-056a, testado em `portfolioProjection.test.ts`) — `projectPortfolio`, `deriveMonthlyReturnPct`, `parseSignedInput`, `resolveDefaultCurrentValue` (T-056b). `parseNonNegativeInput`/`parseMonthsInput`/`formatDecimalInput` **não são duplicados** aqui — o componente (`DashboardPage.tsx`) importa direto de `savingsProjection.ts`, que já são genéricos.
- **Taxa negativa é aceita aqui e NÃO na poupança** — divergência deliberada: uma ação pode cair de valor (`projectPortfolio` aceita `monthlyRatePct` na faixa `> -100`), enquanto o rendimento de poupança nunca é negativo (`projectSavings` rejeita `< 0`). É por isso que `parseSignedInput` (aceita sinal) é um parser novo em vez de reusar `parseNonNegativeInput`. Ganho negativo é cenário legítimo da simulação — o card não trata isso como erro, só troca a cor para `--color-down`.
- **Aporte mensal recorrente (T-062)**: 4º campo do card ("Aporte mensal (R$)", opcional, vazio = sem aporte), mesma fórmula/convenção documentada na T-040 acima. **A assimetria é interna à própria função**: a *taxa* aceita sinal, o *aporte* nunca (`< 0` → `null`). Com taxa **negativa** a anuidade continua finita e sem ramo especial — `(1 + i)^n − 1` e `i` são ambos negativos, o termo do aporte é positivo e menor que `A × n` (cada aporte encolhe até o fim do prazo), então `totalGain` pode ser negativo mesmo tendo entrado dinheiro. Coberto por teste, incluindo taxa próxima de -100% com aporte (nada de `NaN`/`Infinity`).
- **Origem dos dois defaults**: valor atual = `resolveDefaultCurrentValue(walletSummary)` — usa `totalCurrentValue` quando disponível, ou cai para `totalInvested` quando `totalCurrentValue` é `null` (cotações indisponíveis), com um hint explicando o fallback. Taxa mensal = `deriveMonthlyReturnPct(operations, walletSummary)`: deriva a taxa mensal **geométrica** implícita no `totalProfitLossPct` já calculado pelo server, usando a data de compra média ponderada pelo valor investido (só `BUY`s) para estimar há quanto tempo o dinheiro está investido. Ambos seguem o padrão `simTouched` da T-040 (defaults por efeito, só enquanto o campo não foi tocado — refetch de `walletSummary` não atropela digitação, idempotente em StrictMode).
- **Limitação conhecida da heurística de `deriveMonthlyReturnPct`**: `BUY`s de posições **já vendidas por completo** (giro histórico sem posição atual) continuam entrando na média ponderada, puxando a data média para trás e subestimando a taxa mensal derivada numa carteira com bastante giro. Não corrigido — filtrar por posição ainda aberta exigiria reconstruir `buildPositionMap` do server no cliente.
- **Guarda explícita para `pct <= -100`** em `deriveMonthlyReturnPct` (revisão da T-056a, ambos os ramos com teste): antes, `pct` exatamente `-100` caía sozinho em `0 ** (1/elapsedMonths) = 0` e devolvia `-100` "por acidente" da aritmética, enquanto `pct < -100` (base negativa, expoente fracionário) já caía na guarda de `NaN`. Os dois casos significam a mesma coisa (perda total ou pior, sem taxa mensal composta coerente) e agora devolvem `null` pelo mesmo caminho explícito, em vez de um coincidir com o resultado certo por sorte de ponto flutuante.
- **A reversão do "sem gráfico" (T-033/T-040) vale só para `/dash`**: o gráfico SVG do resultado da projeção é a T-057b, e entra no **mesmo card** — não é uma mudança de política geral do app, `/poupanca` continua sem gráfico.
- Card **oculto sem posições** (`walletSummary.positions.length === 0`) — o estado vazio do `PortfolioDashboard` já cobre "adicione operações"; simular sobre valor atual 0 não agregaria nada.
- **Fora de escopo (segue pendente)**: comparação com CDI/Ibovespa e endpoint de projeção no server. (Aporte mensal recorrente saiu do pendente na T-062.)

#### Gráfico SVG da projeção, sem lib (T-057b)

`packages/web/src/components/ProjectionChart.tsx` desenha a linha da projeção dentro do card "Projeção de ganhos" (`DashboardPage.tsx`), abaixo dos dois números (valor projetado/ganho). Decisão do spike (T-057a): **SVG escrito à mão, sem lib de gráficos** — o bundle é só React+router e o custo de uma lib inteira não se justifica para uma linha de projeção composta. Nenhuma dependência nova foi adicionada.

- **Toda a matemática vem de `packages/web/src/routes/chartGeometry.ts` (T-057a/b), testada em `chartGeometry.test.ts`** — `buildProjectionSeries`, `scaleLinear`, `buildLinePath`, `buildAreaPath`, `pickTicks` e `computeValueDomain` (acrescentada na T-057b). **Desde a T-062, `buildProjectionSeries` não repete a fórmula composta: cada ponto do mês `m` é `projectPortfolio(currentValue, ratePct, m, contribution).futureValue`** — com o aporte na conta, duas cópias da fórmula (uma para os números do card, outra para a linha) divergiriam na primeira mudança. Efeitos: a validação de entrada e a guarda de overflow vêm do mesmo caminho (`null` → série `[]`), o último ponto da série é sempre igual ao `futureValue` exibido (coberto por teste), e `chartGeometry.ts` passou a importar de `portfolioProjection.ts` (dependência num só sentido — `portfolioProjection` não conhece geometria). Mudança de borda aceita: `buildProjectionSeries(0, taxa/prazo extremos)` antes devolvia `[]` (por `0 × Infinity = NaN`) e agora devolve a série de zeros que `projectPortfolio` já devolvia como projeção válida. `ProjectionChart.tsx` é **só de render**: recebe a série já pronta (`series: ProjectionPoint[]`) e só faz `scaleLinear`/`buildLinePath`/`buildAreaPath` para converter em coordenadas de pixel — nenhuma lógica de dados nova vive no componente.
- **`computeValueDomain(values, baseline)`** calcula o domínio do eixo Y sempre incluindo a baseline (valor inicial) e uma margem de 10% do intervalo, para a linha nunca tocar as bordas do desenho. Intervalo degenerado (taxa 0%, reta horizontal) cai para uma margem proporcional ao valor absoluto da baseline, com piso de `MIN_ABS_PADDING = 1` para baseline `0` (que geraria margem 0 de novo).
- **`DashboardPage`** computa `projectionSeries = buildProjectionSeries(parsedCurrentValue, parsedRatePct, parsedMonths, parsedContribution)` com os MESMOS inputs já validados por `projection` (`projectPortfolio`) — nenhuma segunda fonte de verdade. O gráfico só é renderizado quando `projectionSeries.length >= 2`: `months = 0` produz um único ponto (mês 0, sem variação), e entrada inválida já produz `projection: null` (os hints existentes cobrem esse caso, o gráfico simplesmente fica ausente).
- **Tooltip/hover (T-067)**: reverte a decisão "sem tooltip" do spike, a pedido do humano. `packages/web/src/routes/chartHover.ts` (`findNearestIndex`, `positionTooltip`, testados nas bordas — série vazia, 1 ponto, antes do primeiro/depois do último) é compartilhado pelos três gráficos SVG da dash (`HistoryChart`, `PriceChart`, `ProjectionChart`). `packages/web/src/routes/svgPointer.ts` (`svgPointFromPointerEvent`) é um wrapper fino sobre `getScreenCTM()`/`createSVGPoint()` — DOM puro, sem lógica de negócio, por isso sem teste próprio (jsdom não implementa a geometria real dessas APIs). Os componentes só chamam `onPointerMove`/`onPointerLeave` no `<svg>`, guardam `hoverIndex` em `useState` e desenham uma linha vertical tracejada + `<foreignObject>` com a tooltip (`.vw-chart-tooltip*`, `dashboard.css`) — os marcadores fixos de início/meio/fim continuam existindo, o hover é aditivo.
- **Cor da linha/área**: `var(--color-up)` quando a projeção termina no valor final >= baseline, `var(--color-down)` quando termina abaixo — mesma semântica de P&L do resto do app. A área usa `color-mix(in srgb, <cor> 12%, transparent)`, o mesmo padrão já usado em `PortfolioDashboard.tsx`. **Nenhuma cor é literal** — tudo sai das CSS custom properties de `index.css`, então o componente não sabe (nem precisa saber) em qual tema está; `vector-effect="non-scaling-stroke"` na linha e na grade evita que o traço engrosse ao redimensionar o `viewBox`.
- **Wrapper fora do scroll da tabela**: `.vw-projection-chart-wrap` (`packages/web/src/routes/dashboard.css`) é um `<div>` só do gráfico, **fora** de `.vw-positions-table-wrap` (o wrapper de scroll horizontal da tabela de posições, mais abaixo no mesmo arquivo de estilos) — o SVG usa `viewBox` + `width: 100%` e nunca deveria entrar num scroll horizontal.
- **Fora de escopo (segue pendente)**: dados históricos/snapshots reais (o gráfico é só da simulação), eixo Y com rótulos numéricos completos (só os 3 marcadores têm valor escrito). (Tooltip/hover saiu do pendente na T-067.)

#### Barras de alocação por ticker (T-057c)

Seção "Alocação da carteira" dentro de `PortfolioDashboard.tsx`, logo abaixo da tabela de posições (mesmo card family, não um card solto na `DashboardPage`) — uma barra fina por posição, densidade visual barata sem SVG (última sugestão do spike da T-057a, "melhorar a page").

- **Função pura**: `buildAllocationRows` (`packages/web/src/routes/allocationRows.ts`, testada em `allocationRows.test.ts`) recebe `positions: Position[]` e devolve as linhas já ordenadas por `allocationPct` decrescente, com `null` (cotação indisponível para aquele ticker) sempre por último e ordem relativa estável entre si. Cada linha traz `pctLabel` pronto para exibição (1 casa decimal pt-BR, ex. "42,3%", ou "—" quando `allocationPct` é `null`) e `pctClamped` (0–100, `0` quando `null`) para a largura da barra — a UI nunca calcula `NaN`, porque a divisão/format já foi feita na função pura.
- **Classes CSS próprias** (`vw-alloc-row/-ticker/-bar-col/-track/-fill/-pct` em `packages/web/src/routes/dashboard.css`), em vez de reusar `.vw-budget-progress-*` de `layers.css`: mesmo padrão visual (trilha `--color-edge`, preenchimento `--color-accent`, 6px de altura), mas a dash de ações e o orçamento por categoria são domínios sem relação — acoplar o CSS de um redesign futuro ao do outro (ex.: a T-037 já removeu a seção de orçamento da UI, mantendo o CSS "congelado") arriscaria os dois ao mesmo tempo.
- **Oculto sem posições**: a seção vive dentro do mesmo componente que já retorna cedo com o estado vazio "Adicione operações para ver sua carteira" quando `summary.positions.length === 0` — não precisou de guarda própria.
- **Fora de escopo (segue pendente)**: gráfico de pizza/SVG, cores por ticker, agrupamento por setor.

### Falha de cotações agora é sinalizada (antes silenciosa)
`fetchQuotes` (`packages/brapi-core/src/quotes.ts`) continua **não derrubando a request** em erro de rede/timeout/resposta não-ok da brapi — mas agora retorna `{ quotes, failed }` em vez de só o `Map`. `failed: true` sinaliza que a busca falhou por completo (distinto de um ticker pontual vir ausente numa resposta bem-sucedida). `routes/portfolio.ts` propaga isso para `buildPortfolioSummary(positionMap, quotes, failed)`, que seta `PortfolioSummary.quotesUnavailable` (campo opcional). Posições sem cotação continuam exibindo `null` nos campos de valor atual e P&L; o dashboard (`PortfolioDashboard.tsx`) mostra um banner discreto (`--color-warn`) quando `quotesUnavailable` está ativo.

### `AlertsPanel` e `CsvImport` sem UI (T-026)
Decisão do humano (`TODO-HUMANO.md`, 2026-07-24, opção b): os componentes `AlertsPanel` e `CsvImport` foram removidos do render de `DashboardPage.tsx`, mas os arquivos, `utils/alerts.ts` e as rotas `/api/alerts` e `/api/import` do server continuam ativos e intactos — aguardando redesign futuro antes de voltarem à UI.

## Decisões: snapshots e histórico de preços

### Coleta diária de snapshots ligada no boot + série histórica (T-058a)
Até a T-058a, `runSnapshotJob()`/`catchUpIfNeeded()` (`packages/portfolio-core/src/snapshots.ts`) existiam mas **nunca eram chamados** — código morto, e `quote_snapshots` de uma base típica tinha uma dúzia de linhas paradas. Agora `index.ts` chama `catchUpIfNeeded()` logo depois do `initDb()`.

- **Por que o boot basta como "guarda"**: `catchUpIfNeeded` já só roda em **dia útil, depois das 18:15 BRT e apenas se não houver snapshot do dia**; o `UNIQUE(ticker, date(captured_at))` fecha a idempotência no banco. Nenhuma guarda nova foi inventada.
- **Não-fatal e não-bloqueante**: a chamada vem **depois** do `app.listen` e num `.catch` que só loga — mesmo espírito do `createUser` da T-050a. `runSnapshotJob` já engole a falha de fetch (3 tentativas com backoff via `withRetry`); o `catch` do boot cobre o resto (erro de banco, rejeição inesperada). Coberto por teste: `catchUpIfNeeded` **resolve** com a brapi indisponível, sem gravar nada.
- **Agendador in-process reexecuta o catch-up periodicamente (T-061)** — o boot deixou de ser o único gatilho. `startSnapshotScheduler(intervalMs, runner)` (`packages/portfolio-core/src/snapshotScheduler.ts`, testada com fake timers) é um `setInterval` genérico que chama `runner()` a cada tick, devolvendo um handle `{ stop }`; `index.ts` liga com `startSnapshotScheduler(30 * 60 * 1000, catchUpIfNeeded)` logo após o catch-up de boot, dentro do mesmo `.then()` do `initDb()`. Nenhuma guarda nova foi inventada: são as mesmas de `catchUpIfNeeded` (dia útil, depois das 18:15 BRT, sem snapshot do dia) + o `UNIQUE(ticker, date(captured_at))` do banco que seguem garantindo a idempotência — o agendador só faz a chamada acontecer de novo. Um erro do `runner` é capturado e logado (nunca derruba o server nem para os ticks seguintes) e o timer é `.unref()`'d (não impede o processo de encerrar). **Limitação que persiste**: é *in-process* — não é cron do SO, não persiste entre restarts e não coordena múltiplas instâncias; morre e nasce com o processo Node. Lambda + EventBridge continua sendo o caminho para produção/deploy distribuído (fora de escopo).

`GET /api/portfolio/history?days=N` monta a série a partir dessas linhas, com a lógica pura em `packages/portfolio-core/src/portfolioHistory.ts` (`buildPortfolioHistory`, `buildDateWindow`, `shiftDate` — testadas):

- **Quantidade detida** vem de um `positionMap` **incremental** (T-063): o laço percorre os dias da janela uma vez e aplica só as operações NOVAS de cada dia via `applyOperation` — a mesma função que `buildPositionMap` chama por trás, sem reimplementar a regra de preço médio ponderado. Antes da T-063 o laço reconstruía o mapa inteiro a cada dia (`buildPositionMap(ops.slice(0, opIdx))`, O(dias × operações)); o resultado é idêntico, só o custo mudou (O(operações + dias)).
- **Preço** é o último fechamento conhecido do ticker até aquela data (**forward-fill**): `quote_snapshots` só tem linha nos dias em que o job rodou, e sem o preenchimento cada fim de semana/feriado/dia de server desligado viraria um vale falso no gráfico. **A query de snapshots tem piso de data (T-063)**: só traz as linhas DENTRO da janela pedida + uma linha de BASE por ticker (o último fechamento anterior ao início da janela, via `MAX(date(captured_at))` agrupado por ticker) — o suficiente para o forward-fill do primeiro dia da janela, sem trafegar o histórico inteiro do ticker. Antes da T-063 a query não tinha piso nenhum; com a coleta diária ligada de verdade (T-058a/T-061), `quote_snapshots` cresce sem parar e ler a tabela inteira a cada request ficaria cada vez mais caro. O seed da primeira BUY (bullet seguinte) continua sendo a defesa para o caso em que nem a janela nem a base têm preço nenhum.
- **O forward-fill é semeado pelo preço da primeira BUY** de cada ticker, na data dela, quando ainda não há nenhum fechamento conhecido para ele — o preço pago é um preço real. Sem o seed, comprar um ticker inédito truncava a série do dia da compra até o primeiro snapshot; com a coleta rodando só no boot, isso pode levar dias. Snapshots posteriores continuam sobrepondo o seed (inclusive um do **mesmo dia** da compra, que vence); um snapshot já conhecido **não** é sobreposto por uma compra posterior — fechamento é a fonte preferida sempre que existe.
- **Semântica de `invested`**: custo de aquisição das posições **ainda detidas** na data (`Σ quantidade × preço médio`) — exatamente o `totalInvested` que o dashboard já mostra, e não "dinheiro aportado acumulado". Uma venda reduz `invested` proporcionalmente (o preço médio não muda numa venda), então as duas linhas continuam comparáveis ponto a ponto.
- **Dias ausentes** (o cliente preenche/interpola — precedente do `/summary` da T-033): dias anteriores à primeira operação, e dias em que **algum** ticker detido ainda não tem nenhum preço conhecido. Essa segunda regra é mais rigorosa que "nenhum preço conhecido" (somar só a parte com preço devolveria um valor silenciosamente subestimado — o mesmo vale falso que o forward-fill evita), mas **com o seed da primeira BUY ela é inalcançável por construção**: só um BUY, que tem preço, cria quantidade positiva. Ficou como cláusula de defesa, não como caminho esperado. Já um dia com a carteira toda vendida **entra** com zeros (é um zero verdadeiro); usuário sem nenhuma operação recebe `[]`.
- **Isolamento**: o filtro por usuário mora na query de `operations` (e a de snapshots só busca os tickers que o próprio usuário operou). `quote_snapshots` **não tem `user_id`** — preço de fechamento é global. Coberto por teste com dois usuários.
- A âncora de "hoje" é a data **BRT** (`getBRTDate`), a mesma do P&L do dia.
- **Fora de escopo (segue pendente)**: backfill histórico de preços anteriores ao início da coleta e qualquer mudança no shape de `quote_snapshots`/no CLI de insights horários.

#### Gráfico de evolução real da carteira na dash (T-058b)
`packages/web/src/api.ts` ganhou `getPortfolioHistory(days?)` (mesmo padrão dos demais fetches — `?days=` só entra na query string quando informado). O card "Evolução da carteira" em `/dash` (`DashboardPage.tsx`) entra **acima** do card "Projeção de ganhos" (T-056/T-057b), entre `PortfolioDashboard` e ele: dado real antes de dado simulado é a ordem de leitura mais natural, e os dois cards de gráfico ficam agrupados em vez de intercalados com a tabela de operações.

- **`HistoryChart.tsx`** (`packages/web/src/components/`) é irmão do `ProjectionChart` (T-057b), mesma decisão de projeto (SVG à mão, sem lib, componente só de render) — mas com domínio de DUAS séries (`value` e `invested`) em vez de uma, e eixo X por **índice do ponto**, não por data. Toda a lógica não trivial vive em `packages/web/src/routes/historyChart.ts` (testado em `historyChart.test.ts`): `computeHistoryDomain` (domínio do eixo Y cobrindo `value` E `invested`, mesma fórmula de margem de 10%/piso absoluto de `computeValueDomain`, mas sem parâmetro de baseline — os dois valores de cada ponto já entram na conta), `isHistoryDown` (tendência = último `value` vs. primeiro, mesma semântica de cor de P&L; `false` neutro para 0/1 ponto) e `buildHistoryIndexScale` (escala de `scaleLinear` sobre o índice 0..N-1, reaproveitada de `chartGeometry.ts`).
- **Por que índice e não data no eixo X**: a resposta do server pode ter **dias ausentes** (fim de semana, sem preço, antes da 1ª operação) — não é uma série contígua. Espaçar por índice e rotular cada tick com a **data real** daquele ponto (`formatDayMonth`, reusado de `expenseMonth.ts`) evita fingir uma densidade de dias que a resposta não tem; a alternativa (posicionar por diferença de dias) exigiria decidir o que fazer com os buracos e não traria benefício visual num gráfico sem tooltip.
- **`invested` é linha de referência, não uma segunda área**: tracejada em `--color-dim`, sem preenchimento — só a linha de `value` tem área (mesmo `color-mix` de 12% do T-057b), para não competir visualmente com a linha principal. Nenhuma cor literal, mesmo motivo do T-057b (tema light/dark de graça).
- **Seletor de janela**: botões 30/90/365 dias (`historyDays`, default 90 — mesmo default do server) em `.vw-history-window` (`dashboard.css`). Trocar a janela refaz o fetch; **guarda de resposta obsoleta** via `historyRequestRef` (um contador, mesmo padrão de `latestRequestedMonthRef` da T-030) — trocar de janela rapidamente não deixa uma resposta antiga sobrescrever uma mais nova que chegou primeiro.
- **Estados**: `points.length < 2` → mensagem "o histórico começa a ser coletado a partir de agora" (esperado logo após a T-058a ligar a coleta — a maioria das bases ainda não acumulou pontos); falha do fetch → aviso discreto (`historyError`) que não derruba o resto da página; sem posições (`hasPositions`) → card oculto, mesmo guard do card de projeção. Criar/excluir uma operação também dispara `refreshHistory` (o dia de hoje muda imediatamente), junto de `refresh`/`refreshWallet`.
- **Fora de escopo (segue pendente)**: exportação do gráfico. (Tooltip/hover saiu do pendente na T-067 — ver acima; comparação com CDI/Ibovespa saiu na T-068 — ver `packages/insights-core/CLAUDE.md`.)

#### Preço por ação (T-060)

Card "Preço por ação" em `/dash`, logo ABAIXO do "Evolução da carteira" (T-058b) — a mesma rota `GET /api/snapshots/:ticker` (pré-existente, alimentada pela coleta diária da T-058a) ganha primeira UI. Pedido do humano: ver a variação de preço de cada ação, não só da carteira toda.

- **Seletores independentes**: um `<select>` de ticker (as posições atuais de `walletSummary.positions`, default a maior alocação via `selectDefaultTicker`, `packages/web/src/routes/priceChart.ts`) + o MESMO padrão de botões de janela 30/90/365 do `HistoryChart`, mas com estado PRÓPRIO (`priceDays`, independente de `historyDays`) — são dois gráficos com propósitos diferentes (carteira consolidada vs. um ativo), trocar a janela de um não deve afetar o outro. Reusa as classes `.vw-history-window*` (`dashboard.css`) por serem um seletor de janela genérico, sem nada específico do card de carteira.
- **Fetch com `from` derivado da janela**: `computeFromDate(days)` (`priceChart.ts`) evita trafegar o histórico inteiro do ticker — mesmo espírito de `?days=` no histórico da carteira. Trocar o TICKER **ou** a JANELA refaz o fetch, com a MESMA guarda de resposta obsoleta da T-058b (`priceRequestRef`, um contador — o `useEffect` depende dos dois, então qualquer uma das trocas invalida a resposta anterior em voo).
- **`PriceChart.tsx`** (`packages/web/src/components/`) é irmão de `HistoryChart`/`ProjectionChart`: SVG à mão, sem lib, só de render. Eixo X por ÍNDICE do ponto (mesmo motivo do `HistoryChart` — a série de fechamentos tem buracos de fim de semana/feriado, `formatDayMonth` rotula com a data REAL de cada ponto). A linha de preço médio de compra é uma referência HORIZONTAL tracejada (não uma segunda série ao longo do tempo, diferente de `invested` no `HistoryChart`) — o preço médio é um único número, não varia por dia.
- **`computeAveragePrice(operations, ticker)`** (`priceChart.ts`) replica a MESMA semântica de `applyOperation`/`buildPositionMap` do server (`packages/portfolio-core/src/portfolio.ts`): média ponderada das BUYs remanescentes, SELL reduz quantidade sem alterar o preço médio. Sem endpoint novo — deriva das `operations` já carregadas na página (mesmo precedente client-side da T-040/T-056). As operações do ticker são reordenadas por `date` ASC (desempate por `id` ASC) antes de aplicar, porque `GET /api/operations` devolve DESC e a ordem de aplicação importa (uma SELL processada antes da BUY que a cobre distorceria o resultado). Devolve `null` — e o gráfico OMITE a referência — quando a posição foi zerada (tudo vendido) ou não há nenhuma BUY do ticker.
- **`computePriceDomain(prices, avgPrice)`** reusa `computeValueDomain` de `chartGeometry.ts` (mesma margem de 10%/piso absoluto), garantindo que o preço médio nunca fique fora do desenho quando existir; sem preço médio, a baseline cai para o primeiro fechamento da série (já incluso em `prices`).
- **Estados**: `snapshots.length < 2` → "o histórico de preços deste ativo começa a ser coletado a partir de agora" (mesma mensagem em espírito da T-058b); falha do fetch → aviso discreto (`priceError`), sem derrubar o resto da página; sem posições → card oculto (mesmo guard dos outros cards de gráfico).
- **Fora de escopo (segue pendente)**: comparação entre tickers, candles/OHLC. (Tooltip/hover saiu do pendente na T-067 — ver acima.)

## Pendências / notas de arquitetura

- **`fetchQuotesStrict` duplica o client da brapi.** `snapshots.ts` fala com
  `https://brapi.dev/api/quote` por conta própria porque precisa **lançar** em
  erro (o `withRetry` depende disso), enquanto `@vetor-wallet/brapi-core`
  degrada em silêncio. Unificar (ex.: `fetchQuotesStrict` migrar para
  `brapi-core` e `fetchQuotes` virar o wrapper tolerante) é candidato a tarefa
  futura — **não** foi feito na T-099c, que era movimentação mecânica.
- **`@vetor-wallet/auth-core` e `@vetor-wallet/insights-core` importam este
  package** (`getOrCreateDefaultWallet` no `createUser`; `buildPositionMap` e os
  helpers de snapshot nos benchmarks/insights). Isso cruza módulos, contra a
  regra 6 de `docs/PACKAGES.md`. É o acoplamento que já existia dentro do
  `server`, apenas tornado explícito pela extração — ver a mesma nota nos
  `CLAUDE.md` daqueles packages.

## Convenções

- Teste ao lado do código (`src/**/*.test.ts`), Vitest. Teste que toca banco
  define `DATABASE_URL` **antes** do `await import('@vetor-wallet/db')` — o
  client lê o env no top-level do módulo.
- Nenhuma cor literal nos gráficos do web: sempre CSS custom properties.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência),
`docs/MODULES.md` (módulo Portfolio), `packages/brapi-core/CLAUDE.md` e
`packages/insights-core/CLAUDE.md`.
