# CLAUDE.md — vetor-wallet-server

API REST em Node + Express + TypeScript (CJS). Leia junto com o `CLAUDE.md` da raiz e o(s) `docs/decisions/*.md` do domínio da tarefa.

## Estrutura

```
src/
└── api/
    ├── index.ts      # entry: sessão, CORS, 18 routers, initDb(), catch-up de
    │                 # snapshots no boot (não-fatal) + scheduler 30min (T-061)
    ├── auth/         # middleware (requireAuth → res.locals.userId) e
    │                 # router (/api/auth/*) — o SERVICE saiu na T-099c
    ├── routes/       # 1 arquivo por recurso REST (ver tabela no CLAUDE.md raiz)
    └── middleware/   # asyncHandler, errorHandler, requireActiveSubscription
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

- `@vetor-wallet/billing-core` (de `services/billing.ts`) — datas UTC no formato
  SQLite e `markChargePaidAndActivate` como única porta de ativação.
  `api/middleware/requireActiveSubscription.ts` **fica aqui** (é Express) e
  importa do package.
- `@vetor-wallet/savings-core` (de `services/savings.ts` e `goals.ts`) — saldo
  livre, transferência poupança → meta, progresso de meta.
- `@vetor-wallet/expenses-core` (de `services/recurringExpenses.ts`) —
  materialização lazy e idempotente de recorrências.

Na T-099c (Ciclo 19) saiu o resto, esvaziando `services/`:

- `@vetor-wallet/bank-import-core` (de `services/{ofx,externalId}.ts`) — parser
  OFX e dedupe por `external_id`. `routes/importOfx.test.ts` consome as fixtures
  via `@vetor-wallet/bank-import-core/fixtures`, um alias **só de teste** que
  precisa vir ANTES do alias do package base no `resolve.alias` (casamento por
  prefixo do Vite).
- `@vetor-wallet/portfolio-core` (de `services/{portfolio,portfolioHistory,wallets,snapshots,snapshotScheduler}.ts`)
  — preço médio ponderado, validação de SELL, série valor × custo, carteiras e a
  coleta de snapshots. **`api/index.ts` continua ligando `catchUpIfNeeded()` e
  `startSnapshotScheduler(30min, catchUpIfNeeded)` no boot** — só mudou de onde
  os dois são importados.
- `@vetor-wallet/insights-core` (de `services/{benchmarks,benchmarkHistory,hourlyInsights}.ts`)
  — benchmarks CDI/Ibovespa e o job horário (também consumido pelo `cli`).
- `@vetor-wallet/auth-core` (de `api/auth/service.ts`) — credenciais, perfil e
  papéis. `auth/middleware.ts` e `auth/router.ts` **ficam aqui** (são Express) e
  importam do package; os testes que sobem app Express (`middleware.test.ts`,
  `changePassword.test.ts`, `profile.test.ts`, `sessionPersistence.test.ts`)
  também ficaram.

Cada um tem seu `CLAUDE.md` com as invariantes do domínio — leia antes de mexer.

Entry compilado: `dist/api/index.js` (`pnpm --filter vetor-wallet-server start`). Rodar `node dist/api/index.js` de fora de `packages/server/` sem `DATABASE_URL` cria um banco novo no cwd errado.

## Regras do pacote

- **Sem ORM** — SQL puro via `@libsql/client`. Schema muda só em `@vetor-wallet/db` (`schema.ts`), sempre idempotente (`IF NOT EXISTS` / ALTER com try-catch).
- Toda query de dados filtra por `user_id`; registro alheio responde 404.
- Cookie `sid`: httpOnly, sameSite lax, secure só em `NODE_ENV=production`; senha bcrypt (SALT_ROUNDS 12).
- Timeouts de 5s nos fetches externos (brapi, benchmarks); falha de cotação não derruba a request (`quotesUnavailable`).
- Testes de rota com banco: tmpdir + `DATABASE_URL` + dynamic import (ver exemplos em `src/api/routes/*.test.ts`).

## Variáveis de ambiente

Ver tabela no `CLAUDE.md` da raiz. `DATABASE_URL` aceita `file:` local ou URL Turso (migração futura: só trocar a env).

## TODOs futuros

- **Turso** para deploy multi-usuário (zero reescrita de queries).
- **AWS Cognito** substituindo `@vetor-wallet/auth-core` + `auth/router.ts` (recuperação de senha, MFA); sessões persistentes (T-034) já não são motivo para migrar.
- Job de insights horários em Lambda + EventBridge (hoje: cli manual + scheduler in-process de snapshots).
