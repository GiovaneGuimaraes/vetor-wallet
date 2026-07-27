# CLAUDE.md — vetor-wallet-server

API REST em Node + Express + TypeScript (CJS). Leia junto com o `CLAUDE.md` da raiz e o(s) `docs/decisions/*.md` do domínio da tarefa.

## Estrutura

```
src/
├── db/               # camada de banco — NÃO importa nada de api/ (exceção
│   │                 # consciente: migrations.ts → api/services/categories)
│   ├── client.ts     # @libsql/client; lê DATABASE_URL no TOP-LEVEL do módulo
│   │                 # (testes setam o env ANTES do dynamic import) ou deriva
│   │                 # process.cwd()/data/wallet.db
│   ├── schema.ts     # initDb(): CREATE TABLE/ALTER idempotentes + limpeza de
│   │                 # sessões expiradas + normalização de categorias no boot
│   ├── migrations.ts # migrações de dados idempotentes (T-028)
│   ├── sessionStore.ts # SqliteSessionStore p/ express-session (T-034)
│   └── index.ts      # barrel: db, initDb, SqliteSessionStore, cleanupExpiredSessions
└── api/
    ├── index.ts      # entry: sessão, CORS, 18 routers, initDb(), catch-up de
    │                 # snapshots no boot (não-fatal) + scheduler 30min (T-061)
    ├── auth/         # service (bcrypt), middleware (requireAuth → res.locals.userId),
    │                 # router (/api/auth/*)
    ├── routes/       # 1 arquivo por recurso REST (ver tabela no CLAUDE.md raiz)
    ├── services/     # lógica de negócio; parte pura (portfolio, dates, money,
    │                 # categories…), parte com SQL (wallets, goals, snapshots…)
    └── middleware/   # asyncHandler, errorHandler
```

Entry compilado: `dist/api/index.js` (`pnpm --filter vetor-wallet-server start`). Rodar `node dist/api/index.js` de fora de `packages/server/` sem `DATABASE_URL` cria um banco novo no cwd errado.

## Regras do pacote

- **Sem ORM** — SQL puro via `@libsql/client`. Schema muda só em `db/schema.ts`, sempre idempotente (`IF NOT EXISTS` / ALTER com try-catch).
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
