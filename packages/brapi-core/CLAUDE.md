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
├── tickers.ts  # searchTickers()/getUnknownTickers(): busca de tickers com
│               # cache de 24h em memória; timeout 10s no fetch da lista
└── index.ts    # barrel: fetchQuotes, fetchQuotesStrict, searchTickers, getUnknownTickers,
                # _resetCache/_setCache (helpers de teste)
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
  429). Toda requisição passa por uma **fila global** (`enqueue`) e um ticker já
  pedido reaproveita a mesma Promise (`inFlight`): chamadas concorrentes não
  duplicam requisição nem cota. Novo caminho de cotação entra nessa fila.
- **Teto total de tempo no modo tolerante: `QUOTES_TOTAL_BUDGET_MS` = 10 s por
  chamada** (N × timeout de 5 s em série travaria `GET /api/portfolio` com a brapi
  fora). O que não coube volta como falha (`failed: true`); a requisição em curso
  não é abortada, termina na fila e popula o cache. O modo estrito não tem teto.
- **429**: até 3 tentativas por ticker, backoff de 500 ms e 1,5 s. Depois disso, é
  falha daquele ticker. Mensagens de erro/log (`brapi responded with <status> for
<ticker>`) nunca incluem a URL, que carrega o token.
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
