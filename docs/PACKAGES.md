# Packages

Categorias, regras de dependência e onde colocar código novo. Para o mapa de domínios de
negócio, veja [`MODULES.md`](./MODULES.md).

> **Estado da migração.** Desde a T-099c (Ciclo 19) `packages/server/src/api/services/`
> **não existe mais**: toda a lógica de domínio virou package. O que resta no `server` é
> Express puro (entry, routers, middleware, `auth/router.ts`, `auth/middleware.ts`).
> Packages marcados *(planejado)* **não existem ainda**; falta renomear `server` → `rest-api`
> (T-100).

## Estrutura

| Package | Categoria | Módulo | Descrição | Hoje em |
|---|---|---|---|---|
| **web** | Frontend | – | React 18 + Vite (ESM); páginas em `src/routes/` | ✅ existe |
| **rest-api** *(planejado)* | Backend | – | Express (CJS): rotas, middleware, entry HTTP | `packages/server` |
| **cli** | Tool | – | Jobs de coleta e scripts (tsx) | ✅ existe |
| **shared** | Core | – | Tipos TS compartilhados, **types-only** | ✅ existe |
| **db** | Infrastructure | – | libsql client, `schema`, `migrations`, `sessionStore`, `sqlErrors` | ✅ existe (T-097) |
| **validation-core** | Core | – | `isValidIsoDate`, `isValidMoneyAmount`, `normalizeCategory` | ✅ existe (T-099a) |
| **auth-core** | Core | Auth | Credenciais, bcrypt, papéis | ✅ existe (T-099c) |
| **portfolio-core** | Core | Portfolio | Posição, preço médio, histórico, snapshots, agendador | ✅ existe (T-099c) |
| **brapi-core** | Integration | Portfolio | Client HTTP da brapi.dev (cotações, tickers) | ✅ existe (T-098) |
| **expenses-core** | Core | Expenses | Recorrência lazy (categoria normalizada saiu para `validation-core`, T-099a) | ✅ existe (T-099b) |
| **savings-core** | Core | Savings | Saldo livre, progresso de meta, transferência | ✅ existe (T-099b) |
| **billing-core** | Core | Billing | Datas, ativação idempotente, gating | ✅ existe (T-099b) |
| **abacatepay-core** | Integration | Billing | Client HTTP da AbacatePay (Pix) | ✅ existe (T-098) |
| **insights-core** | Core | Insights | Benchmarks CDI/Ibovespa, insights horários | ✅ existe (T-099c) |
| **bank-import-core** | Core | BankImport | Parser OFX, dedupe por `external_id` | ✅ existe (T-099c) |
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

   > **Duas violações conhecidas, herdadas da extração (T-099c).**
   > `auth-core → portfolio-core` (`createUser` chama `getOrCreateDefaultWallet`) e
   > `insights-core → portfolio-core` (benchmarks usam `buildPositionMap`; o job horário usa
   > os helpers de snapshot). Os dois acoplamentos já existiam **dentro** do `server` e a
   > T-099c, sendo movimentação mecânica, só os tornou explícitos — não os introduziu nem os
   > desfez. Desacoplar (a rota orquestrando os dois módulos) é tarefa futura; **não** use
   > isso como precedente para um novo core → core.

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
