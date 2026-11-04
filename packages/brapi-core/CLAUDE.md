# CLAUDE.md — @vetor-wallet/brapi-core

Client HTTP da [brapi.dev](https://brapi.dev) do Vetor Wallet, extraído de
`packages/rest-api/src/api/services/quotes.ts` e `tickers.ts` na T-098
(Ciclo 19 — arquitetura em módulos). Categoria **Integração**, módulo
**Portfolio** (ver `docs/MODULES.md`/`docs/PACKAGES.md`). Consumido pelo `rest-api`, pelo
`insights-core` e pelo `portfolio-core` (coleta de snapshots, T-120).

## Estrutura

```
src/
├── quotes.ts   # requestQuotes() (interno, lança) + as duas políticas:
│               # fetchQuotes() degrada (quotes vazio + failed=true) e
│               # fetchQuotesStrict() lança. Timeout 5s
├── tickers.ts  # searchTickers()/getUnknownTickers(): busca de tickers com
│               # cache de 24h em memória; timeout 10s no fetch da lista
└── index.ts    # barrel: fetchQuotes, fetchQuotesStrict, searchTickers, getUnknownTickers,
                # _resetCache/_setCache (helpers de teste)
```

## Invariantes (não quebrar)

- **`fetchQuotes` tem timeout de 5s e degrada em silêncio.** Cotação ausente
  é tolerável: quem chama (`services/benchmarks.ts`, `routes/portfolio.ts`)
  segue a request com `quotesUnavailable` sinalizado, e há cache de
  snapshots diários para preencher a lacuna. Erro de rede, timeout ou
  resposta não-ok viram `{ quotes: new Map(), failed: true }` — nunca lança.
- **`fetchQuotesStrict` é a política OPOSTA, de propósito (T-120).** Um só client
  (`requestQuotes`: mesma URL/token/timeout/parse); as duas funções só diferem no
  que fazem com o erro. A estrita lança: o erro original em rede/timeout,
  `brapi responded with <status>` em não-ok e `brapi returned empty results`
  quando pediu tickers e nada veio. Ticker ausente de um payload NÃO vazio só
  fica fora do `Map` (como na tolerante). Com lista vazia ainda faz a requisição
  (herdado; a tolerante curto-circuita sem chamar). Quem usa: a coleta de
  snapshots (`portfolio-core`), onde o `withRetry` precisa do erro e um preço
  falso gravado seria pior que nenhum. Não funda as duas políticas.
- **`failed: true` é exclusivo de a própria requisição ter falhado**, não de
  um ticker específico não vir no payload de uma resposta bem-sucedida
  (ticker deslistado/typo simplesmente fica de fora do `Map`).
- **`searchTickers`/`getUnknownTickers` usam um cache de 24h** (`tickerCache`
  em memória do processo). Se a brapi falhar e houver cache válido ou
  expirado, devolve o cache stale em vez de lista vazia — só retorna
  `listAvailable: false` quando não há NENHUM cache. `_resetCache`/
  `_setCache` existem só para teste.
- **Token via `process.env.BRAPI_TOKEN`**, lido dentro de cada função (não
  no top-level do módulo) — permite trocar o env entre casos de teste.
- **Nunca importa `@vetor-wallet/db`** (regra 2 de `docs/PACKAGES.md`,
  packages de Integração não tocam banco) nem `express`/`req`/`res`.

## Convenções

- Sem lib HTTP — `fetch` nativo com `AbortSignal.timeout`.
- Teste ao lado do código (`src/**/*.test.ts`), Vitest, mockando `fetch`
  global (`vi.stubGlobal`).

Ver também `CLAUDE.md` da raiz e `docs/MODULES.md` (módulo Portfolio).
