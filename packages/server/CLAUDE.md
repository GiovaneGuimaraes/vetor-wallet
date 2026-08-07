# CLAUDE.md — vetor-wallet-server

API REST em Node + Express + TypeScript (CJS). Leia junto com o `CLAUDE.md` da raiz e o(s) `docs/decisions/*.md` do domínio da tarefa.

## Estrutura

```
src/
└── api/
    ├── index.ts      # entry: sessão, CORS, 18 routers, initDb(), catch-up de
    │                 # snapshots no boot (não-fatal) + scheduler 30min (T-061)
    ├── auth/         # service (bcrypt), middleware (requireAuth → res.locals.userId),
    │                 # router (/api/auth/*)
    ├── routes/       # 1 arquivo por recurso REST (ver tabela no CLAUDE.md raiz)
    ├── services/     # lógica de negócio com SQL (wallets, goals, snapshots…)
    └── middleware/   # asyncHandler, errorHandler
```

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

Cada um tem seu `CLAUDE.md` com as invariantes do domínio — leia antes de mexer.

Entry compilado: `dist/api/index.js` (`pnpm --filter vetor-wallet-server start`). Rodar `node dist/api/index.js` de fora de `packages/server/` sem `DATABASE_URL` cria um banco novo no cwd errado.

## Regras do pacote

- **Sem ORM** — SQL puro via `@libsql/client`. Schema muda só em `@vetor-wallet/db` (`schema.ts`), sempre idempotente (`IF NOT EXISTS` / ALTER com try-catch).
- Toda query de dados filtra por `user_id`; registro alheio responde 404.
- Cookie `sid`: httpOnly, sameSite lax, secure só em `NODE_ENV=production`; senha bcrypt (SALT_ROUNDS 12).
- Timeouts de 5s nos fetches externos (brapi, benchmarks); falha de cotação não derruba a request (`quotesUnavailable`).
- Testes de rota/serviço com banco: tmpdir + `DATABASE_URL` + dynamic import (ver exemplos em `src/api/routes/*.test.ts`).

## Variáveis de ambiente

Ver tabela no `CLAUDE.md` da raiz. `DATABASE_URL` aceita `file:` local ou URL Turso (migração futura: só trocar a env).

## TODOs futuros

- **Turso** para deploy multi-usuário (zero reescrita de queries).
- **AWS Cognito** substituindo auth/service+router (recuperação de senha, MFA); sessões persistentes (T-034) já não são motivo para migrar.
- Job de insights horários em Lambda + EventBridge (hoje: cli manual + scheduler in-process de snapshots).
