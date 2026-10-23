# CLAUDE.md — vetor-wallet-rest-api

API REST em Node + Express + TypeScript (CJS). Leia junto com o `CLAUDE.md` da raiz e o(s) `docs/decisions/*.md` do domínio da tarefa.

## Estrutura

```
src/
└── api/
    ├── index.ts      # entry: sessão, CORS, 24 routers, initDb(), catch-up de
    │                 # snapshots no boot (não-fatal). O scheduler de 30min da
    │                 # T-061 saiu na T-109b; o router admin, na T-109a
    ├── auth/         # middleware (requireAuth → res.locals.userId) e
    │                 # router (/api/auth/*) — o SERVICE saiu na T-099c
    ├── routes/       # 1 arquivo por recurso REST (ver tabela no CLAUDE.md raiz)
    └── middleware/   # asyncHandler, errorHandler, requireActiveSubscription,
                      # requirePluggyEnabled (gate ENVIRONMENT, T-089b)
```

**Não há mais `src/api/services/`** — desde a T-099c toda a lógica de domínio
vive em packages `*-core`. Este pacote é Express puro: entry, routers,
middleware. Regra prática: se o arquivo novo não fala `req`/`res`/`next`, ele
não pertence aqui.

A camada de banco (`client.ts`, `schema.ts`, `migrations.ts`, `sessionStore.ts`,
`sqlErrors.ts`) foi extraída para `packages/db` na T-097 (Ciclo 19) — consumida
daqui via `import { db, initDb, ... } from '@vetor-wallet/db'`. Ver
`packages/db/CLAUDE.md` para as invariantes daquela camada (leitura de
`DATABASE_URL` no top-level, ordem obrigatória nos testes com dynamic import,
idempotência das migrações).

As validações puras transversais (`isValidIsoDate`, `isValidMoneyAmount`,
`normalizeCategory`) foram extraídas para `packages/validation-core` na T-099a
(Ciclo 19) — consumidas via `import { ... } from '@vetor-wallet/validation-core'`.
Ver `packages/validation-core/CLAUDE.md`.

Na T-099b (Ciclo 19) saíram mais três cores de domínio, consumidos por rotas e
middleware daqui:

- `@vetor-wallet/subscription-core` (de `services/billing.ts`; absorveu o
  `abacatepay-core` na T-103) — datas UTC no formato SQLite e
  `markChargePaidAndActivate` como única porta de ativação.
  `api/middleware/requireActiveSubscription.ts` **fica aqui** (é Express) e
  importa do package. Desde a T-114 as quatro funções com banco deste package
  recebem `query: Query` **injetado** (`getSubscriptionRow({ query, userId })`)
  em vez de `db: Db` — quem passa é a rota/middleware, que injeta
  `createSqliteQuery(db)` (mesmo padrão de `routes/alerts.ts`).
- `@vetor-wallet/savings-core` (de `services/savings.ts`) — saldo da poupança em
  centavos inteiros. O que era de metas (`goals.ts`, transferência, progresso)
  saiu na T-091b1, junto com `routes/goals.ts` e `POST /api/savings/transfer-to-goal`.
- `@vetor-wallet/expenses-core` (de `services/recurringExpenses.ts`) —
  materialização lazy e idempotente de recorrências.

Na T-099c (Ciclo 19) saiu o resto, esvaziando `services/`:

- `@vetor-wallet/bank-import-core` (de `services/{ofx,externalId}.ts`) — parser
  OFX e dedupe por `external_id`. `routes/importOfx.test.ts` consome as fixtures
  via `@vetor-wallet/bank-import-core/fixtures`, um alias **só de teste** que
  precisa vir ANTES do alias do package base no `resolve.alias` (casamento por
  prefixo do Vite).
- `@vetor-wallet/portfolio-core` (de `services/{portfolio,portfolioHistory,wallets,snapshots}.ts`)
  — preço médio ponderado, validação de SELL, série valor × custo, carteiras e a
  coleta de snapshots. **`api/index.ts` continua ligando `catchUpIfNeeded({ db })`
  no boot** — é o único gatilho da coleta; o `startSnapshotScheduler(30min, …)`
  que acompanhava essa chamada foi removido na T-109b. Desde a T-104 (fatias 1/2
  e 2/2 da migração de formato) **toda** função do package que toca banco recebe
  `db` injetado — `getOrCreateDefaultWallet({ db, userId })`,
  `getPreviousCloseSnapshots({ db, tickers, beforeDateISO })`,
  `getSnapshotHistory({ db, ticker, from, to })`, `catchUpIfNeeded({ db })` — e
  quem passa é a rota (ou o entry, no boot).
- `@vetor-wallet/insights-core` (de `services/{benchmarks,benchmarkHistory}.ts`)
  — benchmarks CDI/Ibovespa. O job horário saiu na T-109a.
- `@vetor-wallet/auth-core` (de `api/auth/service.ts`) — credenciais, perfil e
  papéis. `auth/middleware.ts` e `auth/router.ts` **ficam aqui** (são Express) e
  importam do package; os testes que sobem app Express (`middleware.test.ts`,
  `changePassword.test.ts`, `profile.test.ts`, `sessionPersistence.test.ts`)
  também ficaram.

Cada um tem seu `CLAUDE.md` com as invariantes do domínio — leia antes de mexer.

Na T-104 entrou `@vetor-wallet/operations-core`, com o SQL que ainda estava em
`routes/{operations,wallets}.ts`. As duas rotas ficaram **sem nenhum SQL**:
validam o corpo, chamam o core e traduzem o resultado em status HTTP. A
costura de `POST /api/operations` fica aqui de propósito — ler as operações do
ticker é `operations-core`, decidir se a venda cabe é `portfolio-core` (funções
puras), e cruzar os dois é papel da rota. `POST /api/import` (CSV) **não** foi
migrado: o INSERT em lote dele continua na rota.

Na fatia 2/2 da migração do `portfolio-core` (T-104), `routes/portfolio.ts` e
`routes/snapshots.ts` também ficaram **sem nenhum SQL**: `GET /api/portfolio` e
`/history` leem as operações por `listOperationsChronological`
(`operations-core`) e os fechamentos por `getPreviousCloseSnapshots`/
`listSnapshotPointsForWindow` (`portfolio-core`), e montam a resposta com as
funções puras daquele package — de novo, a rota é quem cruza os dois cores.

Ainda na T-104, o SQL de `routes/expenseEntries.ts` desceu para o
`@vetor-wallet/expenses-core` (que já era dono de `expense_entries`): a rota
ficou **sem nenhuma query**. O que fica aqui de propósito:

- **`currentMonth`, `shiftMonthKey` e `MATERIALIZATION_HORIZON_MONTHS`** —
  interpretam o parâmetro da request (qual mês, qual janela, até onde um GET
  pode materializar). `routes/incomeEntries.ts` importa `currentMonth` daqui.
- **A decisão de materializar antes de ler** — `materializeRecurringExpenses`
  é chamada pela rota; as funções de leitura do core não escrevem.
- **O POST**, que passa por `insertEntryWithExternalId`
  (`@vetor-wallet/bank-import-core`): a dedupe por `external_id` é política do
  módulo BankImport, e é a rota que cruza os dois módulos. Mesmo arranjo de
  `routes/incomeEntries.ts`.

Na mesma T-104 entrou `@vetor-wallet/alerts-core`, com o SQL que ainda estava
em `routes/alerts.ts`. A rota ficou **sem nenhum SQL**: valida tipo/threshold
do corpo (inclusive `isValidMoneyAmount`), normaliza o `ticker` e chama o
core; a validação ficou aqui de propósito — é entrada de usuário, não acesso
a dado, e já existia na rota antes da extração. Na T-114 a rota passou a
injetar `createSqliteQuery(db)` (mesmo padrão de `routes/savings.ts` e
`routes/fixedIncome.ts`) em vez de passar `db` direto para o core.

Na T-106 entrou `@vetor-wallet/cognito-core` (Integração), e `auth/router.ts`
virou o lugar onde **`auth-core` e `cognito-core` se cruzam** — mesmo arranjo de
`routes/pluggy.ts`. O que mora só ali:

- **`auth/cognitoErrorResponse.ts`** — `CognitoErrorCode` → status HTTP +
  mensagem em português. `userNotFound` responde igual a `invalidCredentials`
  (401) para não entregar um oráculo de "este e-mail tem conta aqui";
  `invalidParameter`/`challengeRequired` são 5xx porque significam "o pool está
  configurado de um jeito que este código não atende", não erro de quem digitou.
- **O 403 `EMAIL_NOT_VERIFIED`** — vem do `auth-core`
  (`CognitoLinkRequiresVerifiedEmailError`), não do Cognito, e é o gate que impede
  assumir uma conta que já existe sem prova de posse do e-mail. É tratado no
  `respondCognitoError` porque a alternativa (deixar subir) daria 500 num caminho
  de segurança. **403 e não 401**: a credencial estava certa, e um 401 faria o
  `web` derrubar a sessão e esconder a causa. O `emailVerified` vem SEMPRE do
  `cognitoGetUser` — nunca do corpo da request.
- **Os tokens do Cognito na `SessionData`** (`auth/middleware.ts`) — a troca de
  senha precisa do access token; o refresh existe porque o token vive ~1h e a
  sessão 7 dias.
- **`auth/__fixtures__/fakeCognito.ts`** — user pool falso que intercepta o
  `fetch` só do endpoint do Cognito. Os ~20 arquivos de teste de rota que criam
  sessão por `POST /api/auth/register` chamam `installFakeCognito()` no topo;
  **nenhum teste bate na AWS**.

Na T-089b entrou `@vetor-wallet/pluggy-core` (Integração) como dependência deste
package, por causa de `routes/pluggy.ts`. **É a rota que cruza os dois módulos**
(regra de `docs/PACKAGES.md`): `bank-import-core` fala com o banco,
`pluggy-core` fala com a Pluggy, e nenhum dos dois se importa. Três coisas que
moram só ali e não devem migrar para os cores:

- **A ordem dos gates**: `requireAuth` → `requirePluggyEnabled` → `requireActiveSubscription`.
- **`GET /api/pluggy/status` é a única rota SEM o gate de ambiente** — é ela que
  informa `enabled` ao web. Gateá-la obrigaria o cliente a ter uma cópia da flag
  em `VITE_*`, a duplicação que a decisão do humano proíbe.
- **`PluggyApiError` vira 502**, não 500: a falha é de terceiro e a mensagem do
  package já é acionável e livre de credencial.

Na T-091c/d (fatia c1) entrou `@vetor-wallet/fixed-income-core` e
`routes/fixedIncome.ts` (`/api/fixed-income`). A rota **não tem SQL**: valida o
corpo (inclusive as regras que cruzam campos — `maturityDate >= investedAt`
contra o estado final no PATCH, e o par `currentValue`/`currentValueDate`) e
injeta `createSqliteQuery(db)` no core, igual a `routes/savings.ts`.

Na T-091d (fatia d2) entrou `GET /api/fixed-income/pluggy`, no mesmo router: a
RF da conexão bancária **lida ao vivo** (`listPluggyItems` → `fetchPluggyInvestments`
por item → `toPluggyFixedIncomePosition`) e **nunca gravada** (decisão do humano,
2026-10-21). Rota irmã de propósito — o `GET /` da RF manual não sabe que a
Pluggy existe, então nenhuma falha dela chega perto. Sempre 200: gate
`ENVIRONMENT` desligado → `enabled: false` sem consultar nada; item que falha
→ conta em `failedConnections` (nunca 500/502), os outros seguem. Sujeita ao
gate `ENVIRONMENT` porque ler um item já conectado também é usar a integração
(o termo do Meu Pluggy é o que o gate protege).

Entry compilado: `dist/api/index.js` (`pnpm --filter vetor-wallet-rest-api start`). Rodar `node dist/api/index.js` de fora de `packages/rest-api/` sem `DATABASE_URL` cria um banco novo no cwd errado.

## Regras do pacote

- **Sem ORM** — SQL puro via `@libsql/client`. Schema muda só em `@vetor-wallet/db` (`schema.ts`), sempre idempotente (`IF NOT EXISTS` / ALTER com try-catch).
- Toda query de dados filtra por `user_id`; registro alheio responde 404.
- Cookie `sid`: httpOnly, sameSite lax, secure só em `NODE_ENV=production`. **A senha não é mais nossa** (T-106): quem valida é o AWS Cognito, e os tokens dele ficam na sessão do SERVIDOR (SQLite) — nunca no cookie, nunca no browser.
- Timeouts de 5s nos fetches externos (brapi, benchmarks); falha de cotação não derruba a request (`quotesUnavailable`).
- Testes de rota com banco: tmpdir + `DATABASE_URL` + dynamic import (ver exemplos em `src/api/routes/*.test.ts`).

## Variáveis de ambiente

Ver tabela no `CLAUDE.md` da raiz. `DATABASE_URL` aceita `file:` local (SQLite, hoje) ou,
depois da migração de banco, uma URL Postgres/Aurora — ver `docs/multi-agent/plano-migracao-aws.md`.
**Turso foi descartado** como destino (decisão 1 da migração, 2026-09-14): o banco de produção
vai ser Aurora Serverless v2 + Postgres, não Turso.

## Deploy: nenhum recurso existe ainda, mas as decisões já foram tomadas (atualizado 2026-10-22)

A API roda **só localmente** hoje — não há host, painel, Dockerfile, `Procfile` nem recurso AWS
provisionado (nenhuma VPC, Aurora, Lambda ou API Gateway existe), e enquanto isso for verdade não
crie configuração de deploy sem pedido explícito.

**Isto não é mais "sem data e sem tarefa"**: desde 2026-09-13 há um plano de migração completo em
`docs/multi-agent/plano-migracao-aws.md`, com as decisões de banco (Aurora/Postgres), transporte
(API Gateway + Lambda, REST preservado, sem AppSync), infra as code (SDK puro + `carlin` liberado
por recurso quando acelerar, revisto em 2026-10-22) e sessão (Postgres na fase 2) já respondidas —
ver `docs/multi-agent/TODO-HUMANO.md`, item "Migração para a AWS". O que falta, nessa ordem: trocar
a facade `db` por `query` nos `*-core` restantes (~176 pontos de SQL, package por PR — só
`savings-core`, `fixed-income-core`, `alerts-core` e `subscription-core` já usam `query`), depois
provisionar a infra de verdade
(passos 6-8 do plano, **parados por decisão do humano** até a troca de facade terminar).

Consequência prática que continua valendo: o rename `server` → `rest-api` (T-100, 2026-08-09) pôde
ser feito sem risco, porque não há ambiente externo apontando para `dist/api/index.js` — só o
`start` deste package. Quando houver deploy de verdade, o caminho do entry vira contrato externo e
essa liberdade acaba.

## TODOs futuros

- **AWS Cognito entrou na T-106** (identidade única; `auth/router.ts` orquestra
  `@vetor-wallet/cognito-core` + `@vetor-wallet/auth-core`). **Recuperação de
  senha entrou na T-108a**: `POST /api/auth/forgot-password` e
  `/reset-password`, sempre 204 (mascarado), fail closed a 503 sem
  `COGNITO_*`. Continua TODO: MFA, login social, a tela de recuperação de
  senha e a de digitar o código de confirmação no `web` (backend pronto:
  `POST /api/auth/confirm`, `/resend-code`, `/forgot-password`,
  `/reset-password`) e o `DROP` de `users.password_hash`.
- Coleta de cotações em background em Lambda + EventBridge (hoje: só o scheduler in-process de
  snapshots). O job de insights horários foi removido na T-109a e renasce lá — mesmo destino da
  fase 3 do plano de migração (passos 6-8).
