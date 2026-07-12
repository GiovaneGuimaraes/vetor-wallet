# CLAUDE.md — vetor-wallet-server

Instruções específicas do pacote `server/`. Leia em conjunto com o `CLAUDE.md` da raiz.

---

## Responsabilidade

API REST em Node + Express + TypeScript (CJS). Expõe os dados da carteira ao frontend, calcula posições via preço médio ponderado, busca cotações na brapi.dev e gerencia autenticação de usuários.

---

## Estrutura relevante

```
server/src/
├── index.ts          # entry point: sessão, CORS, rotas, initDb()
├── db.ts             # cliente @libsql/client + initDb() (schema + migrações)
├── auth/
│   ├── service.ts    # hashPassword, verifyPassword, createUser, findUserByEmail
│   ├── middleware.ts # requireAuth → 401 sem sessão; seta res.locals.userId
│   └── router.ts     # POST /register /login /logout  GET /me
├── routes/
│   ├── operations.ts # CRUD de operações (filtrado por user_id)
│   ├── portfolio.ts  # cálculo de posição + cotações (filtrado por user_id)
│   ├── alerts.ts     # CRUD de alertas (filtrado por user_id)
│   ├── import.ts     # importação CSV (filtrado por user_id)
│   └── benchmarks.ts # CDI / Ibovespa (filtrado por user_id)
├── services/
│   ├── portfolio.ts  # buildPositionMap, buildPortfolioSummary (lógica pura)
│   ├── quotes.ts     # fetchQuotes → brapi.dev (timeout 5s)
│   └── benchmarks.ts # fetchCDIAccumulated, fetchIbovespaReturn (timeout 5s)
└── middleware/
    ├── asyncHandler.ts # wrapper que encaminha rejeições para next()
    └── errorHandler.ts # middleware de erro global → 500 JSON
```

---

## Variáveis de ambiente

| Variável | Padrão | Obrigatório em prod |
|---|---|---|
| `PORT` | `3001` | Não |
| `BRAPI_TOKEN` | — | Não (limite maior com token) |
| `SESSION_SECRET` | `dev-secret-change-in-production` | **Sim** |
| `ALLOWED_ORIGIN` | `http://localhost:5173` | **Sim** |
| `NODE_ENV` | — | Sim (`production` ativa cookie `secure`) |

---

## Autenticação

- Sessão via `express-session` com **MemoryStore** (sessões perdidas no restart).
- Cookie `sid`: `httpOnly`, `sameSite: lax`, `secure` apenas em `NODE_ENV=production`.
- `requireAuth` retorna 401 e propaga `res.locals.userId` para as rotas.
- Todas as queries de dados filtram por `user_id` — usuários não enxergam dados alheios.
- Senha armazenada como hash bcrypt (`SALT_ROUNDS = 12`).

---

## Banco de dados

SQLite via `@libsql/client` em `server/data/wallet.db` (criado automaticamente).  
Schema gerenciado em `db.ts > initDb()` com `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE` idempotentes (try/catch para colunas já existentes).

**Não use ORM** — SQL puro via `@libsql/client`.  
**Inicie o servidor sempre a partir de `server/`** — `db.ts` usa `process.cwd()` para montar o path do banco.

---

## TODOs futuros

### Migração do banco de dados
SQLite é suficiente para uso local/single-user. Para deploy multi-usuário ou alta concorrência, migrar para **Turso** (libsql remoto — zero reescrita de queries) ou **PostgreSQL** (requer adaptação do driver).

### Migração do sistema de autenticação para AWS Cognito
A auth atual (bcrypt + express-session + MemoryStore) é funcional mas limitada:
- Sessões não sobrevivem a restart do servidor
- Sem recuperação de senha, MFA ou gestão de usuários fora da aplicação

Migrar para **AWS Cognito** resolve todos esses pontos e integra com o ecossistema AWS se o deploy seguir essa direção. A troca envolve substituir `auth/service.ts` e `auth/router.ts` pelo SDK Cognito e trocar cookies de sessão por JWT (access + refresh tokens).
