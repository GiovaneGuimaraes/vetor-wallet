# CLAUDE.md — @vetor-wallet/db

Camada de banco do Vetor Wallet, extraída de `packages/server/src/db/` na T-097
(Ciclo 19 — arquitetura em módulos). Consumida hoje só pelo `server`
(via `@vetor-wallet/db`) e indiretamente pelo `cli` (via `@vetor-wallet/server`).
Não importa nada de `server`/`web`/Express. Desde a T-099a depende de
`@vetor-wallet/validation-core` (transversal, sem I/O, sem ciclo) para
`normalizeCategory` — nenhum outro `*-core` de domínio é importado.

## Estrutura

```
src/
├── client.ts      # @libsql/client; lê DATABASE_URL no TOP-LEVEL do módulo
│                  # (testes setam o env ANTES do dynamic import) ou deriva
│                  # process.cwd()/data/wallet.db
├── schema.ts      # initDb(): CREATE TABLE/ALTER idempotentes + limpeza de
│                  # sessões expiradas + normalização de categorias no boot
├── migrations.ts  # migrações de dados idempotentes (T-028)
├── sessionStore.ts # SqliteSessionStore p/ express-session (T-034/T-046)
├── sqlErrors.ts   # classificação de erros do driver (isUniqueViolation)
└── index.ts       # barrel: db, initDb, SqliteSessionStore,
                   # cleanupExpiredSessions, isUniqueViolation
```

## Invariantes (não quebrar)

- **`client.ts` lê `process.env.DATABASE_URL` no TOP-LEVEL do módulo.** Toda a
  convenção de teste do projeto depende disso: testes setam `DATABASE_URL`
  para um banco temporário **antes** de `await import('@vetor-wallet/db')` (ou
  de um submódulo como `./client`/`./schema`). Um `import` estático seria
  hoisted acima do set do env. Nunca inverta essa ordem — foi exatamente essa
  classe de bug que causou a T-095 (teste flaky por ordem de import/env).
- **ALTERs em `migrations.ts`/`schema.ts` são idempotentes** (`IF NOT EXISTS`,
  `CREATE UNIQUE INDEX IF NOT EXISTS`, `ALTER TABLE` com try/catch ignorando
  "coluna já existe"). `initDb()` roda a cada boot — rodar duas vezes seguidas
  tem que produzir o mesmo estado.
- **Sessões do `express-session` são persistidas no SQLite** (`sessionStore.ts`,
  T-034/T-046), não no `MemoryStore` padrão — é o que faz login sobreviver a
  restart do server. TTL deriva de `cookie.maxAge`; expiração é fail-closed
  (dado corrompido em `expires_at` é tratado como sessão expirada, nunca como
  válida para sempre).
- **`normalizeCategory` em `migrations.ts` importa `@vetor-wallet/validation-core`**
  (T-099a). Antes disso era uma cópia local (T-097, porque um `db` isolado não
  podia depender de volta em `server`); agora `db` e `server` compartilham a
  mesma implementação via esse core transversal, que **não** depende de `db`
  (evita ciclo). Só resta a cópia de `web/src/routes/categories.ts` — o
  navegador não consome package de backend. Ver `packages/validation-core/CLAUDE.md`.

## Convenções

- Sem ORM — SQL puro via `@libsql/client`. Schema muda só em `schema.ts`.
- `DATABASE_URL` aceita `file:` local ou URL Turso (migração futura: só trocar
  a env).
- Testes usam banco temporário (tmpdir) + `DATABASE_URL` setado antes do
  dynamic import — ver exemplos em `src/*.test.ts`.

Ver também `CLAUDE.md` da raiz (arquitetura geral) e
`docs/decisions/db-schema.md` (schema SQL completo) e
`docs/decisions/sessions-auth.md` (sessões persistentes).
