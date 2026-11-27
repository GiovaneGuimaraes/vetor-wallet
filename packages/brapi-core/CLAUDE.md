# CLAUDE.md — @vetor-wallet/brapi-core

Client HTTP da [brapi.dev](https://brapi.dev) do Vetor Wallet, extraído de
`packages/rest-api/src/api/services/quotes.ts` e `tickers.ts` na T-098
(Ciclo 19 — arquitetura em módulos). Categoria **Integração**, módulo
**Portfolio** (ver `docs/MODULES.md`/`docs/PACKAGES.md`). Consumido pelo `rest-api`, pelo
`insights-core` e pelo `portfolio-core` (coleta de snapshots, T-120).

## Estrutura

```
src/
├── quotes.ts   # requestQuote()/requestQuotes() (internos: 1 ticker por
│               # requisição, série, cache 5 min) + as duas políticas:
│               # fetchQuotes() degrada (quotes vazio + failed=true) e
│               # fetchQuotesStrict() lança. Timeout 5s
├── brapiQueue.ts         # enqueueBrapi(): a fila global (1 requisição por vez)
├── fetchDailyHistory.ts  # histórico 3mo/1d com cache de 12h + coalescência
├── requestDailyHistory.ts # a requisição crua do histórico (sem fila/cache)
├── BrapiStatusError.ts   # erro de status não-ok, com `status`
├── tickers.ts  # searchTickers()/getUnknownTickers(): busca de tickers com
│               # cache de 24h em memória; timeout 10s no fetch da lista
└── index.ts    # barrel: fetchQuotes, fetchQuotesStrict, fetchDailyHistory,
                # BrapiStatusError, searchTickers, getUnknownTickers, mercado,
                # _reset*/_setCache (helpers de teste)
```

## Invariantes (não quebrar)

- **Plano GRÁTIS da brapi: 1 ticker por requisição e 1 requisição simultânea**
  (verificado com requisições reais; o dono não paga plano de dados). 2+ tickers
  na mesma URL → HTTP 400 `QUOTES_PER_REQUEST_EXCEEDED`; concorrência → 429.
  Por isso `requestQuotes` faz **uma requisição por ticker, em série — nunca
  `Promise.all`**. Cada 200 gasta 1 da cota mensal de 15.000; 4xx não gasta.
  Não volte a juntar tickers numa URL só (quebra com 2+ ativos: carteira sem
  cotação e job de snapshots falhando em todo retry).
- **Economia de cota**: tickers são deduplicados e há **cache em memória por
  ticker, TTL 5 min** (`QUOTE_CACHE_TTL_MS`; a cotação do grátis já tem ~30 min de
  atraso). Só preço obtido é cacheado. O cache vale para as duas políticas — o
  retry do snapshot não repete tickers que já deram certo. Novo caminho que
  busque cotação deve passar por `fetchQuotes`/`fetchQuotesStrict`, nunca
  chamar a brapi direto. `_resetQuoteCache` existe só para teste.
- **Nunca 2 chamadas à brapi em voo no processo.** `/api/portfolio` e
  `/api/benchmarks` chegam juntas do web, e o grátis só aceita 1 simultânea (senão
  429). Toda requisição passa por uma **fila global** (`enqueueBrapi`, em
  `brapiQueue.ts`) e um ticker já pedido reaproveita a mesma Promise (`inFlight`):
  chamadas concorrentes não duplicam requisição nem cota. Cotação E histórico
  diário entram na MESMA fila; novo caminho que gaste cota entra nela também.
- **Cotação tem prioridade sobre histórico na fila** (`enqueueBrapi(job, 'quote' |
  'history')`): duas filas lógicas, um executor; histórico só roda sem cotação
  pendente (sem preempção — espera no máximo o job em voo). E o modo tolerante
  **enfileira todos os tickers de uma vez**, senão um histórico entraria entre
  duas cotações seriais. Motivo (revisão da PR #284): com cache frio, ~16
  históricos da página na frente de 10 cotações a 600 ms estouravam o teto de
  10 s e a carteira ficava "sem cotação".
- **Promise compartilhada só rejeita com erro REAL da brapi** (rede, timeout,
  status não-ok) — nunca com o teto de tempo de um chamador. O teto é aplicado
  localmente por quem o tem (`withinBudget`); o job sempre roda. Um job
  "descartado no topo da fila" pelo teto do tolerante já existiu e vazava o erro
  de orçamento para o chamador ESTRITO que coalescia nele (snapshots falhando por
  causa de uma tela aberta) — não volte a descartar. E a entrada sai de
  `inFlight` no MESMO handler que assenta a Promise (cotação e histórico): quem
  chega depois de uma falha faz pedido novo, nunca herda a Promise rejeitada.
- **Histórico diário dos gráficos (`fetchDailyHistory`)**: `/quote/{ticker}?range=3mo&interval=1d`
  — o máximo do plano grátis (1y e intradiário → 400; `^BVSP` funciona). 1 ticker por
  requisição, pela fila global, com coalescência própria (`inFlight`). **Cache em memória
  de 12 h por ticker** (`HISTORY_CACHE_TTL_MS`): o dado é de fechamento diário, e com 12 h
  cada ticker custa no máximo ~2 requisições/dia, compartilhadas entre usuários e visitas.
  **Erro não é cacheado**; 200 sem pontos é (gastou cota, repetir não muda). Lança
  `BrapiStatusError` (com `status`) em resposta não-ok — a rota traduz 400/404 em 404 e o
  resto em 502. `requestDailyHistory` é a requisição crua (429 com o mesmo backoff);
  teste em `src/dailyHistory.test.ts`. Os períodos 5D/1M/3M do web são recortes disto.
- **Teto total de tempo no modo tolerante: `QUOTES_TOTAL_BUDGET_MS` = 10 s por
  chamada** (N × timeout de 5 s em série travaria `GET /api/portfolio` com a brapi
  fora). O que não coube volta como falha (`failed: true`); a requisição em curso
  não é abortada, termina na fila e popula o cache. O modo estrito não tem teto.
  **O cache é consultado ANTES do orçamento**: ticker já cotado responde mesmo com
  o teto esgotado. O que passou do teto o tolerante deixa de ESPERAR (falha local),
  mas o job já estava na fila desde o início da chamada e segue: busca o preço e
  alimenta o cache (gasta cota — são os tickers da própria carteira, que a próxima
  chamada pediria de qualquer jeito). Depois do teto, nada NOVO é enfileirado.
- **429**: até 3 tentativas por ticker, backoff de 500 ms e 1,5 s. Depois disso, é
  falha daquele ticker. Mensagens de erro/log
  (`brapi responded with <status> for <ticker>`) nunca incluem a URL, que carrega
  o token.
- **`fetchQuotes` (tolerante) nunca lança.** Falha de um ticker (rede, timeout,
  não-ok) não derruba os demais: os que deram certo ficam em `quotes` e
  `failed: true` sinaliza que ao menos um falhou (a rota segue com
  `quotesUnavailable`, e há snapshots diários para preencher a lacuna). Timeout
  5s por requisição.
- **`fetchQuotesStrict` é a política OPOSTA, de propósito (T-120).** Mesmo
  client; só difere no que faz com o erro. Lança na PRIMEIRA falha de ticker
  (erro original em rede/timeout, `brapi responded with <status> for <ticker>`)
  e `brapi returned empty results` quando pediu tickers e nenhum preço veio.
  Ticker ausente do payload só fica fora do `Map`. Lista vazia não faz
  requisição. Quem usa: coleta de snapshots (`portfolio-core`), onde o
  `withRetry` precisa do erro e um preço falso gravado seria pior que nenhum. Não
  funda as duas políticas.
- **`failed: true` é exclusivo de a requisição de um ticker ter falhado**, não de
  um ticker não vir no payload de uma resposta bem-sucedida (deslistado/typo).
- **`searchTickers`/`getUnknownTickers` usam um cache de 24h** (`tickerCache`
  em memória do processo). Se a brapi falhar e houver cache válido ou
  expirado, devolve o cache stale em vez de lista vazia — só retorna
  `listAvailable: false` quando não há NENHUM cache. `_resetCache`/
  `_setCache` existem só para teste.
- **Universo do "Mercado hoje" (`fetchMarketList`/`getMarketUniverse`)**: `/quote/list?type=stock&limit=1000`
  (grátis, sem token, não consome cota — por isso o token NÃO é enviado). Cache próprio
  de **15 min**, separado do de 24h dos tickers (não os una). Brapi fora: devolve o cache
  vencido com o `fetchedAt` original (horário honesto); sem cache, lança (a rota vira 502).
  Formato-alvo (1 função por arquivo), teste em `src/marketList.test.ts`. O ranking e o
  piso de liquidez (R$ 5 mi/dia) vivem no `portfolio-core` (`rankMarketMovers`), não aqui.
- **Token via `process.env.BRAPI_TOKEN`**, lido dentro de cada função (não
  no top-level do módulo) — permite trocar o env entre casos de teste.
- **Nunca importa `@vetor-wallet/db`** (regra 2 de `docs/PACKAGES.md`,
  packages de Integração não tocam banco) nem `express`/`req`/`res`.

## Convenções

- Sem lib HTTP — `fetch` nativo com `AbortSignal.timeout`.
- Teste ao lado do código (`src/**/*.test.ts`), Vitest, mockando `fetch`
  global (`vi.stubGlobal`).

Ver também `CLAUDE.md` da raiz e `docs/MODULES.md` (módulo Portfolio).
