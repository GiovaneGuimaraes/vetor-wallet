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
├── db.ts             # @libsql/client + initDb() — suporta DATABASE_URL
├── auth/
│   ├── service.ts    # hashPassword, verifyPassword, createUser, findUserByEmail
│   ├── middleware.ts # requireAuth → 401 sem sessão; seta res.locals.userId
│   └── router.ts     # POST /register /login /logout  GET /me
├── routes/
│   ├── operations.ts # CRUD de operações (filtrado por user_id + wallet_id)
│   ├── portfolio.ts  # cálculo de posição + cotações (filtrado por user_id)
│   ├── snapshots.ts  # GET /api/snapshots/:ticker — histórico diário de preços
│   ├── alerts.ts     # CRUD de alertas (filtrado por user_id)
│   ├── import.ts     # importação CSV (filtrado por user_id)
│   ├── benchmarks.ts # CDI / Ibovespa
│   ├── wallets.ts    # CRUD de carteiras
│   └── tickers.ts    # busca de tickers na brapi
├── services/
│   ├── portfolio.ts      # buildPositionMap, buildPortfolioSummary (lógica pura)
│   ├── quotes.ts         # fetchQuotes → brapi.dev (timeout 5s)
│   ├── snapshots.ts      # saveSnapshot, runSnapshotJob, resolveActiveTickers, withRetry
│   ├── hourlyInsights.ts # runHourlyInsightsJob — captura horária retroativa via brapi
│   ├── benchmarks.ts     # fetchCDIAccumulated, fetchIbovespaReturn (timeout 5s)
│   └── tickers.ts        # busca e cache de tickers disponíveis
└── middleware/
    ├── asyncHandler.ts   # wrapper que encaminha rejeições para next()
    └── errorHandler.ts   # middleware de erro global → 500 JSON
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
| `DATABASE_URL` | *(deriva de `process.cwd()/data/wallet.db`)* | Para Turso ou CLI externo |

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

`db.ts` resolve o caminho assim:
1. Se `DATABASE_URL` estiver definido, usa diretamente (suporta `file:` local ou URL Turso).
2. Senão, deriva `file:<process.cwd()>/data/wallet.db` e cria o diretório se necessário.

**Não use ORM** — SQL puro via `@libsql/client`.

O server pode ser iniciado de qualquer diretório via `pnpm --filter vetor-wallet-server dev`; só há problema se rodar `node dist/index.js` diretamente de fora de `server/` sem setar `DATABASE_URL`.

---

## Serviço de insights horários

`services/hourlyInsights.ts` implementa o **Plan A** de coleta retroativa:

- `runHourlyInsightsJob(targetDate?)` — resolve tickers ativos, busca `range=5d&interval=1h` na brapi para cada um, filtra candles do dia-alvo em BRT e persiste via `INSERT OR IGNORE` em `hourly_quote_insights`.
- Faz bridging: grava o último candle do dia também em `quote_snapshots`, mantendo o contrato de `GET /api/snapshots/:ticker`.
- Falha por ticker é logada individualmente sem interromper os demais.
- Reutiliza `withRetry` e `resolveActiveTickers` de `snapshots.ts`.

O job não tem agendador interno — é invocado pelo package `cli` ou, futuramente, por um handler Lambda.

---

## TODOs futuros

### Migração do banco de dados
SQLite é suficiente para uso local/single-user. Para deploy multi-usuário ou alta concorrência, migrar para **Turso** (libsql remoto — zero reescrita de queries, basta setar `DATABASE_URL`).

### Migração do sistema de autenticação para AWS Cognito
A auth atual (bcrypt + express-session + MemoryStore) é funcional mas limitada:
- Sessões não sobrevivem a restart do servidor
- Sem recuperação de senha, MFA ou gestão de usuários fora da aplicação

Migrar para **AWS Cognito** resolve todos esses pontos. A troca envolve substituir `auth/service.ts` e `auth/router.ts` pelo SDK Cognito e trocar cookies de sessão por JWT.
