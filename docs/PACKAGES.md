# Packages

Categorias, regras de dependência e onde colocar código novo. Para o mapa de domínios de
negócio, veja [`MODULES.md`](./MODULES.md).

> **Estado da migração.** Desde a T-099c (Ciclo 19) `packages/rest-api/src/api/services/`
> **não existe mais**: toda a lógica de domínio virou package. O que resta no `server` é
> Express puro (entry, routers, middleware, `auth/router.ts`, `auth/middleware.ts`).
> Packages marcados *(planejado)* **não existem ainda**; falta renomear `server` → `rest-api`
> (T-100).

## Estrutura

| Package | Categoria | Módulo | Descrição | Hoje em |
|---|---|---|---|---|
| **web** | Frontend | – | React 18 + Vite (ESM); páginas em `src/routes/` | ✅ existe |
| **rest-api** *(planejado)* | Backend | – | Express (CJS): rotas, middleware, entry HTTP | `packages/rest-api` |
| **cli** | Tool | – | Jobs de coleta e scripts (tsx) | ✅ existe |
| **shared** | Core | – | Tipos TS compartilhados, **types-only** | ✅ existe |
| **db** | Infrastructure | – | libsql client, `schema`, `migrations`, `sessionStore`, `sqlErrors` | ✅ existe (T-097) |
| **validation-core** | Core | – | `isValidIsoDate`, `isValidMoneyAmount`, `normalizeCategory` | ✅ existe (T-099a) |
| **auth-core** | Core | Auth | Espelho de identidade (`cognito_sub`), perfil, papéis | ✅ existe (T-099c) |
| **cognito-core** | Integration | Auth | Client HTTP do AWS Cognito (login, cadastro, confirmação, troca de senha) | ✅ existe (T-106) |
| **portfolio-core** | Core | Portfolio | Posição, preço médio, histórico, snapshots, agendador | ✅ existe (T-099c) |
| **brapi-core** | Integration | Portfolio | Client HTTP da brapi.dev (cotações, tickers) | ✅ existe (T-098) |
| **expenses-core** | Core | Expenses | Recorrência lazy (categoria normalizada saiu para `validation-core`, T-099a) | ✅ existe (T-099b) |
| **savings-core** | Core | Savings | Saldo da poupança em centavos (metas saíram na T-091b1) | ✅ existe (T-099b) |
| **subscription-core** | Core | Subscriptions | Datas, ativação idempotente, gating + provider AbacatePay | ✅ existe (T-103) |
| **insights-core** | Core | Insights | Benchmarks CDI/Ibovespa, insights horários | ✅ existe (T-099c) |
| **bank-import-core** | Core | BankImport | Parser OFX, dedupe por `external_id` | ✅ existe (T-099c) |
| **pluggy-core** | Integration | BankImport | Client HTTP da Pluggy (Open Finance): auth 2h, contas, transações por cursor | ✅ existe (T-087) |

## Categorias

- **Frontend** — aplicação web voltada ao usuário.
- **Backend** — a API HTTP. Só aqui existe Express, sessão, `req`/`res`.
- **Core** — lógica de negócio dona de um domínio. A maioria é pura, mas um core **pode** ter
  persistência quando ele é o dono daquele dado (`subscription-core`, `savings-core` e
  `portfolio-core` falam com `db`). "Core" significa *dono das regras/dados do domínio*, não
  *nunca faz I/O*.
- **Integration** — cliente de serviço de terceiro (brapi, Pluggy). Traduz o mundo externo em
  tipos nossos e devolve. **Só vira package quando mais de um módulo o consome** — integração
  de um módulo só vive como provider dentro do core dele (ver regra 3).
- **Infrastructure** — banco e afins, sem regra de negócio.
- **Tool** — utilitários de desenvolvimento e operação.

## Regras de dependência

1. **Core não depende de Frontend/Backend.** Nenhum `*-core` importa `express`, `req`, `res`
   ou qualquer coisa de `rest-api`/`web`. Um core que precisa reportar erro lança um erro
   tipado; quem traduz para status HTTP é a rota.
2. **Client de terceiro não toca `db`.** Busca, valida o envelope e devolve; quem persiste é o
   core de domínio. Vale tanto para package de Integração quanto para provider dentro de um
   core — lá a regra é fronteira de *pasta*, não de package.
3. **Integração de um módulo só nasce como provider dentro do core dele**, em
   `src/providers/<nome>/`; vira package de Integração quando um segundo módulo passar a
   consumi-la.

   > `pluggy-core` (T-087) é a exceção deliberada: nasceu package porque era a decisão
   > registrada no roadmap do módulo BankImport, e porque há um segundo consumidor previsto
   > (endpoint `investments`, para reconciliar posição B3 no Portfolio). Não use como
   > precedente para integração nova de um módulo só.

   > `cognito-core` (T-106) é package, e não `auth-core/src/providers/cognito/`,
   > por um motivo diferente do `pluggy-core`: a regra 2 diz que client de
   > terceiro **não toca `db`**, e o `auth-core` existe justamente para tocar o
   > banco (é o dono de `users`). Provider dentro dele colocaria o `fetch` da AWS
   > e o SQL do espelho no mesmo package — a fronteira que mais importa aqui, com
   > senha e token de um lado e `user_id` do outro, ficaria sendo só disciplina de
   > pasta. Fora isso, o `rest-api` precisa dos dois **lado a lado** na mesma
   > rota, o que já é o formato de "dois módulos se cruzam na rota".

   > `brapi-core` é package porque Portfolio **e** Insights o consomem. A AbacatePay virou
   > `subscription-core/src/providers/abacatepay/` (T-103) porque só existe por causa da
   > assinatura — Pix é forma de cobrar, não domínio. Enquanto era package irmão, "quem
   > orquestra o provedor" não tinha dono e a orquestração se espalhou por quatro rotas.
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
2. **Chama uma API externa (brapi, AbacatePay, Pluggy)?** → `src/providers/<nome>/` do core do
   módulo que a usa; package de Integração só se **dois ou mais** módulos a consumirem.
3. **É rota HTTP, middleware ou validação de request?** → `rest-api`.
4. **É SQL de schema, migração ou o client?** → `db`.
5. **É tipo compartilhado entre server e web?** → `shared` (só tipos).
6. **É componente, página ou hook React?** → `web`.
7. **É script ou job disparado por fora?** → `cli`.

**Qual módulo?** Consulte [`MODULES.md`](./MODULES.md) e escolha o dono da entidade primária.

## Convenções de package

- Cada package tem seu próprio `CLAUDE.md` com as invariantes do domínio — é o que os agentes
  leem antes de mexer ali. Ele substitui o arquivo equivalente em `docs/decisions/`.
- **ESLint e Prettier são configurados só na raiz** (`eslint.config.mjs`, `.prettierrc`) e
  rodam pelos scripts da raiz (`pnpm lint`, `pnpm format`). Package **não** tem config nem
  script próprio de lint/format: um package novo já nasce coberto, sem ninguém precisar
  lembrar de criar o arquivo. Regras específicas de um package (React no `web`, por exemplo)
  entram como bloco com `files:` na config da raiz. Foi assim que os onze `*-core` ficaram
  fora do ESLint durante o Ciclo 19 inteiro (T-102).
- Cada core publica `main: dist/index.js` + `types: dist/index.d.ts` — é o que o `rest-api`
  **compilado** precisa em produção, já que o `require()` emitido no `dist` do `rest-api` não
  entende `.ts`. Em dev e teste, porém, a resolução tem que ir para o CÓDIGO-FONTE, nunca para o
  `dist` (que pode não existir ou estar desatualizado): os `paths` do `tsconfig.json` cobrem
  `tsc`/`tsx watch`, e cada `vitest.config.ts` que consome um core precisa do alias explícito
  correspondente em `resolve.alias` (ex.: `'@vetor-wallet/db': path.resolve(__dirname,
  '../db/src/index.ts')`) — sem ele o Vitest cai no `main` do package.json e a suíte passa a
  validar um build antigo (falso verde).

## Formato de package (alvo)

O `subscription-core` (T-103) é o **piloto** do formato para o qual todos os `*-core` vão
migrar. Package novo já nasce assim; os antigos migram um por vez, em tarefas próprias.

- **Uma função exportada por arquivo**, nome do arquivo = nome da função. `src/index.ts` é um
  barrel de exports nomeados explícitos, nada mais. Tipo de linha do banco fica junto do mapper
  que o projeta (`Plan.ts` = `PlanRow` + `toPlan`).
- **`db` chega injetado.** Nenhum core importa o singleton `db`; as funções com I/O recebem
  `db: Db` (tipo de `@vetor-wallet/db`) no objeto de argumentos, e quem passa é a rota, o job ou
  o teste. É o que permite testar com `{ execute: jest.fn(), batch: jest.fn() }`, sem banco
  temporário e sem `DATABASE_URL` antes de um `await import()` dinâmico.
- **Teste fora do `src/`**, em `tests/unit/tests/*.test.ts`, **um por arquivo de `src/`**,
  importando por path alias (`import { x } from 'src/x'`). Bordas (`db`, `fetch`) são mockadas;
  funções do próprio package, **nunca** — mockar o vizinho faz o teste provar a chamada em vez
  da regra.
- **Cobertura 100%** em statements/branches/functions/lines, com `src/index.ts` fora da conta.
- **Snapshot no SQL** das queries: elas são o contrato com o banco, e um `WHERE` alterado em
  silêncio é o que mais passa despercebido em review.
- **Stryker (mutation testing) sob demanda** — `pnpm --filter <pkg> mutation`, fora do
  `pnpm test` e do CI de PR.

### Estado da migração de formato

| Package | Formato | Runner |
|---|---|---|
| `subscription-core` | ✅ alvo | Jest + Stryker |
| `validation-core` | ✅ alvo (T-104a) | Jest |
| `pluggy-core` | ✅ alvo, exceto runner (T-087) | Vitest, teste ao lado (segue `brapi-core`) |
| `cognito-core` | ✅ alvo, exceto runner (T-106) | Vitest, teste ao lado, cobertura 100% |
| demais `*-core`, `db` | arquivo-balaio, `db` importado, teste em `src/**/*.test.ts` | Vitest |

> `validation-core` foi o segundo package migrado e o **calibre** do formato:
> puro, sem I/O, sem `db` para injetar — escolhido de propósito para descobrir
> cedo e barato o que do padrão do `subscription-core` só faz sentido por
> causa de `db`/provider HTTP. Achado: `db` injetado, `setupTests.ts` e
> `moduleNameMapper` de workspace package não se aplicam a um core sem
> dependência nem estado global; Stryker não entrou nesta migração (fora do
> escopo da T-104a). Ver `packages/validation-core/CLAUDE.md` → "Onde este
> package DIVERGE do piloto".

Enquanto um package não migrou, valem as regras antigas: teste ao lado do código
(`src/**/*.test.ts`) e teste que toca banco define `DATABASE_URL` **antes** do
`await import('@vetor-wallet/db')` — o client lê o env no top-level do módulo.
