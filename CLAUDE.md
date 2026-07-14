# CLAUDE.md — Vetor Wallet

Guia de arquitetura e operação para assistentes de IA. Leia este arquivo antes de qualquer tarefa no repositório.

---

## Visão do produto

Vetor Wallet é uma carteira pessoal de ações da B3. O usuário cadastra operações de compra/venda manualmente; o servidor calcula posições consolidadas via preço médio ponderado e busca cotações em tempo real na [brapi.dev](https://brapi.dev). O dashboard exibe valor investido, valor atual e P&L por ativo e no total.

**Roadmap:** alertas por regras, sugestões via LLM, comparação com CDI/Ibovespa, deploy do job de insights horários em AWS Lambda.

---

## Stack e estrutura

```
vetor-wallet/
├── package.json            # raiz pnpm workspace (packageManager: pnpm@10.32.1)
├── pnpm-workspace.yaml     # packages: [shared, web, server, cli]
├── pnpm-lock.yaml          # lockfile único — não edite manualmente
├── shared/                 # tipos TypeScript compartilhados entre server e web
│   └── src/index.ts        # Operation, Position, PortfolioSummary, HourlyQuoteInsight…
├── server/                 # Node + Express + TypeScript (CJS) — API REST
│   ├── src/
│   │   ├── index.ts        # entry point: sessão, CORS, rotas, initDb()
│   │   ├── db.ts           # @libsql/client + initDb(); suporta DATABASE_URL
│   │   ├── auth/           # register/login/logout, requireAuth middleware, bcrypt
│   │   ├── routes/         # operations, portfolio, snapshots, alerts, import,
│   │   │                   # benchmarks, wallets, tickers
│   │   ├── services/       # portfolio, quotes, snapshots, hourlyInsights,
│   │   │                   # benchmarks, tickers
│   │   └── middleware/     # asyncHandler, errorHandler
│   ├── data/wallet.db      # SQLite local (gitignored, criado automaticamente)
│   ├── .env.example
│   └── tsconfig.json       # target ES2022, module CommonJS
├── cli/                    # CLIs de coleta de dados (TypeScript CJS, sem Express)
│   ├── src/
│   │   └── hourlyInsights.ts  # job de captura horária de cotações via brapi
│   ├── .env.example        # DATABASE_URL=file:../server/data/wallet.db
│   └── tsconfig.json       # path alias @vetor-wallet/server/* → ../server/src/*
└── web/                    # Vite + React 18 + TypeScript (ESM)
    ├── src/
    │   ├── main.tsx         # monta <App /> em StrictMode
    │   ├── App.tsx          # estado global, orquestra refresh
    │   ├── api.ts           # todas as chamadas fetch (baseURL via VITE_API_URL)
    │   └── components/      # OperationForm, OperationsList, PortfolioDashboard…
    ├── .env.example
    └── tsconfig.json        # strict, noEmit, moduleResolution: bundler
```

---

## Comandos principais

> Todos os comandos abaixo devem ser executados a partir da **raiz do repositório**.

```bash
# instalar dependências (gera/atualiza pnpm-lock.yaml na raiz)
pnpm install

# desenvolvimento (server em :3001, web em :5173)
pnpm dev

# build de produção (server → server/dist/, web → web/dist/)
pnpm build

# apenas server
pnpm dev:server
pnpm --filter vetor-wallet-server build

# apenas web
pnpm dev:web
pnpm --filter vetor-wallet-web build

# rodar server compilado (após build)
cd server && node dist/index.js

# job de insights horários (requer cli/.env com DATABASE_URL)
pnpm --filter vetor-wallet-cli insights:hourly
pnpm --filter vetor-wallet-cli insights:hourly 2025-07-10   # data específica
```

`pnpm dev` usa `&` para paralelismo — no Windows, considere usar dois terminais separados (`pnpm dev:server` e `pnpm dev:web`) se houver problemas.

---

## Configuração de ambiente

```bash
cp server/.env.example server/.env
cp web/.env.example web/.env
cp cli/.env.example cli/.env          # necessário antes de rodar o CLI
```

### server/.env

| Variável | Padrão | Obrigatório em prod |
|---|---|---|
| `PORT` | `3001` | Não |
| `BRAPI_TOKEN` | — | Não (limite maior com token) |
| `SESSION_SECRET` | `dev-secret-change-in-production` | **Sim** |
| `ALLOWED_ORIGIN` | `http://localhost:5173` | **Sim** |
| `NODE_ENV` | — | Sim (`production` ativa cookie `secure`) |
| `DATABASE_URL` | *(deriva de `process.cwd()/data`)* | Para Turso/deploy remoto |

### web/.env

| Variável | Padrão |
|---|---|
| `VITE_API_URL` | `http://localhost:3001` |

### cli/.env

| Variável | Exemplo | Descrição |
|---|---|---|
| `DATABASE_URL` | `file:../server/data/wallet.db` | Caminho do SQLite (relativo ao diretório do CLI) |
| `BRAPI_TOKEN` | — | Token brapi.dev (opcional) |

O banco SQLite (`server/data/wallet.db`) é criado automaticamente em `initDb()` na primeira execução do server.

---

## API Routes

Base URL: `http://localhost:3001`

Todas as rotas abaixo (exceto `/api/auth/*`) exigem sessão autenticada via cookie `sid`.

| Método | Path | Descrição |
|---|---|---|
| `POST` | `/api/auth/register` | Cria conta — body: `{ email, password }` |
| `POST` | `/api/auth/login` | Login — body: `{ email, password }` |
| `POST` | `/api/auth/logout` | Encerra sessão |
| `GET` | `/api/auth/me` | Retorna usuário autenticado |
| `GET` | `/api/wallets` | Lista carteiras do usuário |
| `POST` | `/api/wallets` | Cria carteira |
| `GET` | `/api/operations` | Lista operações (filtrado por wallet) |
| `POST` | `/api/operations` | Cria operação |
| `DELETE` | `/api/operations/:id` | Remove operação |
| `GET` | `/api/portfolio` | `PortfolioSummary` com cotações em tempo real |
| `GET` | `/api/snapshots/:ticker` | Histórico diário de preços |
| `POST` | `/api/import` | Importa CSV de corretora |
| `GET` | `/api/alerts` | Lista alertas |
| `POST` | `/api/alerts` | Cria alerta |
| `DELETE` | `/api/alerts/:id` | Remove alerta |
| `GET` | `/api/benchmarks` | Retorno CDI e Ibovespa no período |
| `GET` | `/api/tickers` | Busca tickers disponíveis na brapi |

---

## Schema do banco

Gerenciado em `server/src/db.ts > initDb()` via `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE` idempotentes.

```sql
-- Usuários
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT    NOT NULL UNIQUE,
  password_hash TEXT   NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Carteiras por usuário
CREATE TABLE IF NOT EXISTS wallets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  color       TEXT    NOT NULL DEFAULT '#e3d5b8',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Operações de compra/venda
CREATE TABLE IF NOT EXISTS operations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker     TEXT    NOT NULL,
  type       TEXT    NOT NULL CHECK(type IN ('BUY', 'SELL')),
  quantity   REAL    NOT NULL,
  price      REAL    NOT NULL,
  date       TEXT    NOT NULL,   -- YYYY-MM-DD
  user_id    INTEGER REFERENCES users(id),
  wallet_id  INTEGER REFERENCES wallets(id),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Snapshot diário de preço (um por ticker por dia)
CREATE TABLE IF NOT EXISTS quote_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker      TEXT    NOT NULL,
  price       REAL    NOT NULL,
  captured_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
-- UNIQUE(ticker, date(captured_at))

-- Preços horários do pregão (alimentados pelo CLI de insights)
CREATE TABLE IF NOT EXISTS hourly_quote_insights (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker      TEXT    NOT NULL,
  quote_date  TEXT    NOT NULL,   -- YYYY-MM-DD
  hour        INTEGER NOT NULL CHECK(hour BETWEEN 0 AND 23),  -- hora BRT
  price       REAL    NOT NULL,
  captured_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
-- UNIQUE(ticker, quote_date, hour)

-- Alertas de preço/alocação
CREATE TABLE IF NOT EXISTS alert_rules (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker    TEXT    NOT NULL,
  type      TEXT    NOT NULL CHECK(type IN ('PRICE_ABOVE','PRICE_BELOW','CHANGE_PCT','ALLOCATION_PCT')),
  threshold REAL    NOT NULL,
  active    INTEGER NOT NULL DEFAULT 1,
  user_id   INTEGER REFERENCES users(id),
  created_at TEXT   NOT NULL DEFAULT (datetime('now'))
);
```

Driver: `@libsql/client` (libsql/SQLite). Sem ORM; queries são SQL puro.

---

## Convenções

- **TypeScript strict** em todos os pacotes.
- **Sem ORM** — SQL puro via `@libsql/client`.
- **Tipos compartilhados em `shared/src/index.ts`** — não duplique interfaces entre server e web.
- **Autenticação via sessão** — cookie `sid` (express-session + MemoryStore). Todas as rotas de dados filtram por `user_id`.
- **Locale pt-BR/BRL** para formatação de números e moeda no frontend (`Intl.NumberFormat`).
- **CSS custom properties** para tema — variáveis em `web/src/index.css`.
- **Nenhum gerenciador de estado externo** no frontend — estado em `App.tsx`, passado via props.
- **pnpm workspaces** — único lockfile na raiz. Nunca rode `npm install` ou `yarn`.

---

## Política de testes

Toda mudança em código de produto — server ou web — deve vir acompanhada de um teste automatizado que cobre o comportamento novo ou alterado, **ou** de uma justificativa explícita de por que testes não se aplicam.

```bash
# server (Vitest — já configurado)
pnpm --filter vetor-wallet-server test

# web — runner ainda não configurado (pendente issue #6)
# até lá, lógica isolável deve ser extraída para funções puras e testada via server
```

| Pacote | Padrão | Exemplo existente |
|---|---|---|
| `server` | `server/src/**/*.test.ts` | `server/src/services/hourlyInsights.test.ts` |
| `web` | `web/src/**/*.test.ts` | — (pendente setup de runner) |

**Não exigem teste novo:** ajustes de estilo/layout, refatoração sem mudança de comportamento, documentação.

**Sempre exigem teste:** nova função de serviço com lógica de negócio, nova rota ou mudança de comportamento, lógica de cálculo.

---

## Pontos de atenção

### `DATABASE_URL` para o CLI e futuro Turso
`server/src/db.ts` usa `process.cwd()/data/wallet.db` por padrão. O CLI roda em `cli/`, então precisa de `DATABASE_URL=file:../server/data/wallet.db` no `cli/.env`. Quando o projeto migrar para Turso, basta apontar `DATABASE_URL` para a URL remota em ambos os ambientes.

### SELL sem validação de saldo
`portfolio.ts` usa `Math.max(0, newQty)` — vender mais do que se possui trunca silenciosamente a quantidade a zero, sem rejeitar a operação.

### Sessões não persistem no restart
`express-session` usa **MemoryStore** — sessões são perdidas quando o servidor reinicia. Aceitável para uso local; para produção, migrar para Redis store ou AWS Cognito.

### Falha silenciosa de cotações
`fetchQuotes` retorna um `Map` vazio em qualquer erro de rede/API. Posições sem cotação exibem `null` nos campos de valor atual e P&L.

### Job de insights horários sem agendador automático
O CLI `pnpm --filter vetor-wallet-cli insights:hourly` precisa ser invocado manualmente ou via cron do SO até o deploy em AWS Lambda + EventBridge (issue futura).
