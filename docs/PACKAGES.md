# Packages

Categorias, regras de dependência e onde colocar código novo. Para o mapa de domínios de
negócio, veja [`MODULES.md`](./MODULES.md).

> **Estado da migração.** Packages marcados *(planejado)* **não existem ainda** — a lógica está
> em `packages/server/src/api/services/`. A coluna "Hoje em" diz de onde o código sai.

## Estrutura

| Package | Categoria | Módulo | Descrição | Hoje em |
|---|---|---|---|---|
| **web** | Frontend | – | React 18 + Vite (ESM); páginas em `src/routes/` | ✅ existe |
| **rest-api** *(planejado)* | Backend | – | Express (CJS): rotas, middleware, entry HTTP | `packages/server` |
| **cli** | Tool | – | Jobs de coleta e scripts (tsx) | ✅ existe |
| **shared** | Core | – | Tipos TS compartilhados, **types-only** | ✅ existe |
| **db** | Infrastructure | – | libsql client, `schema`, `migrations`, `sessionStore`, `sqlErrors` | ✅ existe (T-097) |
| **validation-core** | Core | – | `isValidIsoDate`, `isValidMoneyAmount`, `normalizeCategory` | ✅ existe (T-099a) |
| **auth-core** *(planejado)* | Core | Auth | Credenciais, bcrypt, papéis | `api/auth/service.ts` |
| **portfolio-core** *(planejado)* | Core | Portfolio | Posição, preço médio, histórico, snapshots | `services/portfolio*.ts`, `wallets.ts`, `snapshots*.ts` |
| **brapi-core** | Integration | Portfolio | Client HTTP da brapi.dev (cotações, tickers) | ✅ existe (T-098) |
| **expenses-core** *(planejado)* | Core | Expenses | Recorrência lazy (categoria normalizada já saiu para `validation-core`, T-099a) | `services/recurringExpenses.ts` |
| **savings-core** *(planejado)* | Core | Savings | Saldo livre, progresso de meta, transferência | `services/savings.ts`, `goals.ts` |
| **billing-core** *(planejado)* | Core | Billing | Datas, ativação idempotente, gating | `services/billing.ts` |
| **abacatepay-core** | Integration | Billing | Client HTTP da AbacatePay (Pix) | ✅ existe (T-098) |
| **insights-core** *(planejado)* | Core | Insights | Benchmarks CDI/Ibovespa, insights horários | `services/benchmark*.ts`, `hourlyInsights.ts` |
| **bank-import-core** *(planejado)* | Core | BankImport | Parser OFX, dedupe por `external_id` | `services/ofx.ts`, `externalId.ts` |
| **pluggy-core** *(planejado)* | Integration | BankImport | Open Finance via Pluggy (Onda C) | – (código novo) |

## Categorias

- **Frontend** — aplicação web voltada ao usuário.
- **Backend** — a API HTTP. Só aqui existe Express, sessão, `req`/`res`.
- **Core** — lógica de negócio dona de um domínio. A maioria é pura, mas um core **pode** ter
  persistência quando ele é o dono daquele dado (`billing-core`, `savings-core` e
  `portfolio-core` falam com `db`). "Core" significa *dono das regras/dados do domínio*, não
  *nunca faz I/O*.
- **Integration** — cliente de serviço de terceiro (brapi, AbacatePay, Pluggy). Traduz o mundo
  externo em tipos nossos e devolve.
- **Infrastructure** — banco e afins, sem regra de negócio.
- **Tool** — utilitários de desenvolvimento e operação.

## Regras de dependência

1. **Core não depende de Frontend/Backend.** Nenhum `*-core` importa `express`, `req`, `res`
   ou qualquer coisa de `rest-api`/`web`. Um core que precisa reportar erro lança um erro
   tipado; quem traduz para status HTTP é a rota.
2. **Integration não toca `db`.** Um client de terceiro busca, valida o envelope e devolve.
   Quem persiste é o core de domínio. (Hoje `abacatepay.ts` e `quotes.ts` já respeitam isso.)
3. **Integration pode depender de Core**, nunca o contrário na mesma direção de dado:
   `billing-core` orquestra `abacatepay-core`, não o inverso.
4. **Backend depende de Core e Integration**, e é o único lugar onde dois módulos se cruzam.
5. **`shared` é types-only** e não depende de nada. **`db` é standalone** — não importa nenhum core.
6. **Core não depende de outro core de módulo diferente.** Transversais (`validation-core`,
   `db`, `shared`) são exceção.

### Nota sobre helpers duplicados server ↔ web

`normalizeCategory` e o cálculo de saldo livre existem em duas cópias porque `shared` é
types-only e o `web` não consome packages de backend. **Extrair para um core não muda isso** —
mesmo um core transversal e sem I/O como `validation-core` (T-099a) roda em Node via `require()`,
o navegador não vai consumi-lo. A regra continua valendo: **as duas cópias mudam juntas** — a
extração só colapsou as cópias do lado backend (`db` e `server` agora compartilham
`validation-core`), não a do `web`. Se um dia isso incomodar, a saída seria expor a função em
runtime também para o bundle do web — não é o caso hoje.

## Onde colocar este código?

1. **É regra de negócio de um domínio (com ou sem banco)?** → `*-core` do módulo dono.
2. **Chama uma API externa (brapi, AbacatePay, Pluggy)?** → package de Integração.
3. **É rota HTTP, middleware ou validação de request?** → `rest-api`.
4. **É SQL de schema, migração ou o client?** → `db`.
5. **É tipo compartilhado entre server e web?** → `shared` (só tipos).
6. **É componente, página ou hook React?** → `web`.
7. **É script ou job disparado por fora?** → `cli`.

**Qual módulo?** Consulte [`MODULES.md`](./MODULES.md) e escolha o dono da entidade primária.

## Convenções de package

- Cada package tem seu próprio `CLAUDE.md` com as invariantes do domínio — é o que os agentes
  leem antes de mexer ali. Ele substitui o arquivo equivalente em `docs/decisions/`.
- Cada core publica `main: dist/index.js` + `types: dist/index.d.ts` — é o que o `rest-api`
  **compilado** precisa em produção, já que o `require()` emitido no `dist` do `rest-api` não
  entende `.ts`. Em dev e teste, porém, a resolução tem que ir para o CÓDIGO-FONTE, nunca para o
  `dist` (que pode não existir ou estar desatualizado): os `paths` do `tsconfig.json` cobrem
  `tsc`/`tsx watch`, e cada `vitest.config.ts` que consome um core precisa do alias explícito
  correspondente em `resolve.alias` (ex.: `'@vetor-wallet/db': path.resolve(__dirname,
  '../db/src/index.ts')`) — sem ele o Vitest cai no `main` do package.json e a suíte passa a
  validar um build antigo (falso verde).
- Teste ao lado do código (`src/**/*.test.ts`), Vitest, em todo package.
- Teste que toca banco define `DATABASE_URL` **antes** do `await import('@vetor-wallet/db')` —
  o client lê o env no top-level do módulo.
