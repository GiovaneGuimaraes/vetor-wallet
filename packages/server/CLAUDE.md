# CLAUDE.md — vetor-wallet-server

Instruções específicas do pacote `server/`. Leia em conjunto com o `CLAUDE.md` da raiz.

---

## Responsabilidade

API REST em Node + Express + TypeScript (CJS). Expõe os dados da carteira ao frontend, calcula posições via preço médio ponderado, busca cotações na brapi.dev e gerencia autenticação de usuários.

---

## Estrutura relevante

```
server/src/
├── index.ts          # entry point: sessão, CORS, rotas, initDb() +
│                     # catchUpIfNeeded() no boot (não-fatal — T-058a) +
│                     # startSnapshotScheduler() reexecutando a cada 30min (T-061)
├── db.ts             # @libsql/client + initDb() — suporta DATABASE_URL
├── auth/
│   ├── service.ts    # hashPassword, verifyPassword, createUser, findUserByEmail
│   ├── middleware.ts # requireAuth → 401 sem sessão; seta res.locals.userId
│   └── router.ts     # POST /register /login /logout  GET /me
├── routes/
│   ├── operations.ts # CRUD de operações (filtrado só por user_id — T-050)
│   ├── portfolio.ts  # cálculo de posição + cotações (filtrado por user_id) e
│   │                 # GET /history — série valor × custo (T-058a)
│   ├── snapshots.ts  # GET /api/snapshots/:ticker — histórico diário de preços
│   ├── alerts.ts     # CRUD de alertas (filtrado por user_id)
│   ├── import.ts     # importação CSV (filtrado por user_id)
│   ├── admin.ts      # POST /api/admin/run-insights-job (requireAdmin)
│   ├── income.ts     # CRUD de fontes de renda mensal fixas
│   ├── incomeEntries.ts # CRUD de renda variável datada com visão mensal
│   │                 # (T-036) — espelho de expenseEntries.ts sem recorrência
│   │                 # nem categoria; reusa currentMonth de expenseEntries.ts
│   ├── expenses.ts   # CRUD de despesas fixas (categoria normalizada — T-028)
│   ├── expenseEntries.ts # CRUD de lançamentos variáveis com visão mensal,
│   │                 # materialização de recorrências e /summary (T-033/T-035)
│   ├── recurringExpenses.ts # gestão dos templates de recorrência (T-035):
│   │                 # lista ativas e encerra (soft); criação é acoplada ao
│   │                 # POST /api/expense-entries com recurring: true
│   ├── savings.ts    # CRUD de lançamentos de poupança + summary + transferência
│   │                 # para meta (T-041)
│   ├── goals.ts      # CRUD de metas (progresso manual ou derivado — T-024)
│   ├── budgets.ts    # orçamento mensal por categoria (upsert — T-023)
│   ├── benchmarks.ts # CDI / Ibovespa
│   ├── wallets.ts    # lista/cria a carteira única do usuário (T-050) — sem DELETE
│   └── tickers.ts    # busca de tickers na brapi
├── services/
│   ├── portfolio.ts      # buildPositionMap, buildPortfolioSummary (lógica pura)
│   ├── goals.ts          # progresso de metas: manual vs derivado dos aportes vinculados
│   ├── savings.ts        # saldo livre da poupança (saldo − reservado em metas),
│   │                     # em centavos inteiros — base da transferência T-041
│   ├── recurringExpenses.ts # materialização lazy/idempotente das ocorrências
│   │                        # de recorrência mensal (T-035) + helpers de data
│   ├── wallets.ts        # carteira única (T-050): DEFAULT_WALLET,
│   │                     # findDefaultWallet, countWallets,
│   │                     # getOrCreateDefaultWallet (+ adoção de operações órfãs)
│   ├── categories.ts     # normalizeCategory — forma canônica de categoria
│   │                     # (T-028; duplicada de propósito no web)
│   ├── quotes.ts         # fetchQuotes → brapi.dev (timeout 5s)
│   ├── snapshots.ts      # saveSnapshot, runSnapshotJob, resolveActiveTickers, withRetry
│   ├── snapshotScheduler.ts # startSnapshotScheduler — setInterval in-process
│   │                     # que reexecuta catchUpIfNeeded (T-061)
│   ├── portfolioHistory.ts # série histórica diária valor × custo, com
│   │                     # forward-fill de preço (T-058a; puro)
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

- Sessão via `express-session` com `SqliteSessionStore` (`auth/sessionStore.ts`) — persistida na tabela `sessions` do mesmo SQLite/libsql do app; sobrevive a restart do server (T-034, ver `../CLAUDE.md`).
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
A auth atual (bcrypt + express-session + `SqliteSessionStore`) é funcional mas limitada:
- Sem recuperação de senha, MFA ou gestão de usuários fora da aplicação
- MemoryStore era limitação conhecida (sessão perdida no restart); resolvida em T-034 com store persistente no SQLite — não é mais motivo para migrar

Migrar para **AWS Cognito** resolve todos esses pontos. A troca envolve substituir `auth/service.ts` e `auth/router.ts` pelo SDK Cognito e trocar cookies de sessão por JWT.
