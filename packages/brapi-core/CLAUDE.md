# CLAUDE.md — @vetor-wallet/brapi-core

Client HTTP da [brapi.dev](https://brapi.dev) do Vetor Wallet, extraído de
`packages/server/src/api/services/quotes.ts` e `tickers.ts` na T-098
(Ciclo 19 — arquitetura em módulos). Categoria **Integração**, módulo
**Portfolio** (ver `docs/MODULES.md`/`docs/PACKAGES.md`). Consumido hoje só
pelo `server` (via `@vetor-wallet/brapi-core`).

## Estrutura

```
src/
├── quotes.ts   # fetchQuotes(): cotação atual em lote, timeout 5s, falha
│               # degrada em silêncio (quotes vazio + failed=true)
├── tickers.ts  # searchTickers()/getUnknownTickers(): busca de tickers com
│               # cache de 24h em memória; timeout 10s no fetch da lista
└── index.ts    # barrel: fetchQuotes, searchTickers, getUnknownTickers,
                # _resetCache/_setCache (helpers de teste)
```

## Invariantes (não quebrar)

- **`fetchQuotes` tem timeout de 5s e degrada em silêncio.** Cotação ausente
  é tolerável: quem chama (`services/benchmarks.ts`, `routes/portfolio.ts`)
  segue a request com `quotesUnavailable` sinalizado, e há cache de
  snapshots diários para preencher a lacuna. Erro de rede, timeout ou
  resposta não-ok viram `{ quotes: new Map(), failed: true }` — nunca lança.
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
