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
│   │   ├── auth/           # register/login/logout, requireAuth middleware, bcrypt,
│   │   │                   # SqliteSessionStore (sessões persistentes)
│   │   ├── routes/         # operations, portfolio, snapshots, alerts, import,
│   │   │                   # benchmarks, wallets, tickers, admin, income,
│   │   │                   # incomeEntries, expenses, expenseEntries,
│   │   │                   # recurringExpenses, savings, goals, budgets
│   │   ├── services/       # portfolio, quotes, snapshots, hourlyInsights,
│   │   │                   # benchmarks, tickers, goals, savings,
│   │   │                   # recurringExpenses, categories
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
    │   ├── theme.ts         # tema light/dark (localStorage vw-theme)
    │   ├── routes/          # páginas do app v4 (HomePage, DespesasPage, RendaPage,
    │   │                    # PoupancaPage, MetasPage, DashboardPage…) + módulos de
    │   │                    # funções puras testáveis (homeMetrics, expenseMonth,
    │   │                    # inlineEdit, savingsTransfer… com *.test.ts ao lado)
    │   ├── layout/          # AppShell, ProtectedShell, LoadingScreen, mascots
    │   ├── components/      # OperationForm, OperationsList, PortfolioDashboard,
    │   │                    # AuthPage, AdminPage… (AlertsPanel/CsvImport fora da UI)
    │   └── utils/           # alerts.ts
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
| `POST` | `/api/admin/run-insights-job` | Dispara o job de insights horários manualmente (exige `requireAdmin`) — body opcional `{ date: 'YYYY-MM-DD' }` |
| `GET` | `/api/income` | Lista fontes de renda mensal do usuário |
| `POST` | `/api/income` | Cria fonte de renda mensal |
| `PATCH` | `/api/income/:id` | Atualiza parcialmente uma fonte de renda (`name`/`type`/`amount`) |
| `DELETE` | `/api/income/:id` | Remove fonte de renda mensal |
| `GET` | `/api/income-entries` | Lista lançamentos de renda variável de um mês (T-036) — query `?month=YYYY-MM` (default: mês corrente). Responde `{ month, entries }` |
| `POST` | `/api/income-entries` | Cria lançamento de renda variável (`description`, `amount`, `date`) |
| `PATCH` | `/api/income-entries/:id` | Atualiza parcialmente um lançamento (`description`/`amount`/`date`); mudar a `date` pode mover o lançamento para outro mês |
| `DELETE` | `/api/income-entries/:id` | Remove lançamento de renda variável |
| `GET` | `/api/expenses` | Lista despesas fixas do usuário |
| `POST` | `/api/expenses` | Cria despesa fixa |
| `PATCH` | `/api/expenses/:id` | Atualiza parcialmente uma despesa fixa (`name`/`category`/`amount`); `category` é normalizada (T-028) |
| `DELETE` | `/api/expenses/:id` | Remove despesa fixa |
| `GET` | `/api/expense-entries` | Lista lançamentos de despesas variáveis de um mês — query `?month=YYYY-MM` (default: mês corrente). Responde `{ month, entries }` |
| `GET` | `/api/expense-entries/summary` | Histórico mensal (T-033): total de lançamentos variáveis por mês — query `?months=N` (default 6, cap 24, `400` para inválido), dos últimos N meses até o corrente. Responde `{ months: [{ month, total }] }`; meses sem lançamento ficam ausentes (o cliente preenche com 0 — ver `buildMonthlyHistory`) |
| `POST` | `/api/expense-entries` | Cria lançamento de despesa variável (`description`, `category?`, `amount`, `date`); `recurring: true` (+ `dayOfMonth?` 1-31) cria também uma recorrência mensal a partir dele (T-035) |
| `PATCH` | `/api/expense-entries/:id` | Atualiza parcialmente um lançamento (`description`/`category`/`amount`/`date`); mudar a `date` pode mover o lançamento para outro mês |
| `DELETE` | `/api/expense-entries/:id` | Remove lançamento de despesa variável (se for ocorrência de recorrência, **não** é recriada no próximo GET — ver "Recorrência de lançamentos") |
| `GET` | `/api/recurring-expenses` | Lista as recorrências mensais **ativas** do usuário (T-035). Não há `POST` — a recorrência nasce no `POST /api/expense-entries` com `recurring: true` |
| `PATCH` | `/api/recurring-expenses/:id` | Encerra a recorrência — único corpo aceito é `{ active: false }`; `active: true` (reativar) e corpo vazio respondem `400` |
| `DELETE` | `/api/recurring-expenses/:id` | Alias de encerrar (`204`). Não apaga o template nem as ocorrências já geradas |
| `GET` | `/api/savings` | Lista lançamentos de poupança/reserva e um `summary` (saldo, total de aportes, total de rendimento) |
| `POST` | `/api/savings` | Cria lançamento de poupança (`DEPOSIT`, `WITHDRAW` ou `YIELD`); aceita `goalId` opcional para vincular a uma meta |
| `POST` | `/api/savings/transfer-to-goal` (T-041) | Reserva para uma meta dinheiro que já está na poupança — body `{ goalId, amount, date, note? }`. Grava um par atômico WITHDRAW (sem vínculo) + DEPOSIT (vinculado), responde `201 { withdraw, deposit }`. `400` quando o valor excede o **saldo livre**; `404` para meta de outro usuário |
| `PATCH` | `/api/savings/:id` | Atualiza parcialmente um lançamento (`type`/`amount`/`date`/`note`/`goalId`); `goalId: null` desvincula da meta — ver "Edição inline nos layers básicos" |
| `DELETE` | `/api/savings/:id` | Remove lançamento de poupança |
| `GET` | `/api/goals` | Lista metas financeiras do usuário, com `current_amount` derivado quando há lançamentos vinculados |
| `POST` | `/api/goals` | Cria meta financeira |
| `PATCH` | `/api/goals/:id` | Atualiza parcialmente uma meta (`name`/`target_amount`/`current_amount`); `current_amount` é rejeitado com `400` em metas com lançamentos vinculados |
| `DELETE` | `/api/goals/:id` | Remove meta financeira |
| `GET` | `/api/budgets` | Lista orçamentos mensais por categoria do usuário |
| `POST` | `/api/budgets` | Cria/atualiza orçamento por categoria — **upsert**: reenviar a mesma `category` (comparada na forma normalizada, ver T-028) substitui o `amount` (não duplica) |
| `DELETE` | `/api/budgets/:id` | Remove orçamento de categoria |

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

-- Fontes de renda mensal (itens fixos cadastrados, não lançamentos datados)
CREATE TABLE IF NOT EXISTS income_sources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  name       TEXT    NOT NULL,
  type       TEXT    NOT NULL DEFAULT 'OUTRO' CHECK(type IN ('SALARIO', 'FREELA', 'OUTRO')),
  amount     REAL    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Lançamentos de renda variável (renda avulsa datada: freela pontual, venda,
-- bônus; a visão mensal filtra por substr(date, 1, 7) = 'YYYY-MM'). Distinto de
-- income_sources, que não tem data e vale para todo mês. Sem categoria e sem
-- recorrência (fora de escopo da T-036).
CREATE TABLE IF NOT EXISTS income_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  description TEXT    NOT NULL,
  amount      REAL    NOT NULL,
  date        TEXT    NOT NULL,   -- YYYY-MM-DD
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_income_entries_user_date ON income_entries(user_id, date);

-- Despesas fixas mensais (itens fixos cadastrados, não lançamentos datados)
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  name       TEXT    NOT NULL,
  category   TEXT    NOT NULL DEFAULT '',
  amount     REAL    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Lançamentos de despesas variáveis (gastos datados do dia a dia; a visão mensal
-- filtra por substr(date, 1, 7) = 'YYYY-MM'). Distinto de fixed_expenses, que
-- não tem data e vale para todo mês.
CREATE TABLE IF NOT EXISTS expense_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  description TEXT    NOT NULL,
  category    TEXT    NOT NULL DEFAULT '',
  amount      REAL    NOT NULL,
  date        TEXT    NOT NULL,   -- YYYY-MM-DD
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expense_entries_user_date ON expense_entries(user_id, date);
-- ALTER idempotente: recurring_id INTEGER REFERENCES recurring_expenses(id)
--   recorrência que gerou a ocorrência (T-035). NULL = lançamento manual.

-- Template de recorrência mensal de despesa variável (T-035). Só o template
-- vive aqui; as ocorrências são expense_entries normais com recurring_id.
-- Encerrar é SEMPRE soft (active = 0 + ended_at) — a linha nunca é apagada.
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  description  TEXT    NOT NULL,
  category     TEXT    NOT NULL DEFAULT '',   -- normalizada (T-028)
  amount       REAL    NOT NULL,
  day_of_month INTEGER NOT NULL CHECK(day_of_month BETWEEN 1 AND 31),
  start_month  TEXT    NOT NULL,   -- YYYY-MM: mês de CRIAÇÃO (ou o mês do
                                   -- lançamento, se futuro). Meses anteriores
                                   -- nunca são gerados — não retroage.
  active       INTEGER NOT NULL DEFAULT 1,
  ended_at     TEXT,               -- NULL enquanto ativa
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user_active
  ON recurring_expenses(user_id, active);

-- Livro-razão de "meses já gerados" de cada recorrência (T-035). É a chave
-- única daqui — e não a existência da ocorrência — que garante idempotência;
-- a linha SOBREVIVE ao delete da ocorrência, então excluir um lançamento
-- gerado não o recria no próximo GET.
CREATE TABLE IF NOT EXISTS recurring_expense_months (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recurring_id INTEGER NOT NULL REFERENCES recurring_expenses(id),
  month        TEXT    NOT NULL,   -- YYYY-MM
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
-- UNIQUE(recurring_id, month)

-- Lançamentos de poupança/reserva (livro de lançamentos; saldo é derivado no server:
-- DEPOSIT + YIELD − WITHDRAW). Sem vínculo com wallet.
CREATE TABLE IF NOT EXISTS savings_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  type       TEXT    NOT NULL CHECK(type IN ('DEPOSIT', 'WITHDRAW', 'YIELD')),
  amount     REAL    NOT NULL,
  date       TEXT    NOT NULL,   -- YYYY-MM-DD
  note       TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
-- ALTER idempotente: goal_id INTEGER REFERENCES goals(id)
--   vínculo opcional com uma meta (T-024). NULL = sem vínculo. Apenas
--   DEPOSIT/WITHDRAW podem ser vinculados.
-- INDEX idx_savings_entries_goal (user_id, goal_id)
-- ALTER idempotente: transfer_group TEXT
--   uuid comum às duas pernas de uma transferência poupança → meta (T-041).
--   NULL = lançamento normal. É etiqueta de PROCEDÊNCIA, não invariante: nada é
--   validado entre as pernas e o PATCH não aceita o campo.

-- Metas financeiras. `current_amount` é o valor MANUAL de fallback: quando a
-- meta tem lançamentos de poupança vinculados (savings_entries.goal_id), o
-- valor exposto pela API é DERIVADO desses lançamentos e esta coluna deixa de
-- ser lida (nem é materializada — ver "Progresso de metas").
CREATE TABLE IF NOT EXISTS goals (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  name           TEXT    NOT NULL,
  target_amount  REAL    NOT NULL,
  current_amount REAL    NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Orçamento mensal por categoria (T-023): teto de gasto sem vínculo com mês —
-- vale para qualquer mês exibido em Despesas, só o gasto comparado varia.
-- UNIQUE(user_id, category); POST faz upsert (substitui o amount existente).
-- `category` é gravada na forma canônica normalizada (T-028), igual a
-- fixed_expenses.category e expense_entries.category — ver "Categoria é
-- normalizada nas 3 telas de despesas/orçamento".
CREATE TABLE IF NOT EXISTS category_budgets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  category   TEXT    NOT NULL,
  amount     REAL    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

Driver: `@libsql/client` (libsql/SQLite). Sem ORM; queries são SQL puro.

---

## Convenções

- **TypeScript strict** em todos os pacotes.
- **Sem ORM** — SQL puro via `@libsql/client`.
- **Tipos compartilhados em `shared/src/index.ts`** — não duplique interfaces entre server e web.
- **Autenticação via sessão** — cookie `sid` (express-session + `SqliteSessionStore`, persistida no SQLite — ver "Sessões persistem no restart"). Todas as rotas de dados filtram por `user_id`.
- **Locale pt-BR/BRL** para formatação de números e moeda no frontend (`Intl.NumberFormat`).
- **CSS custom properties** para tema — variáveis em `web/src/index.css`.
- **Nenhum gerenciador de estado externo** no frontend — estado em `App.tsx`, passado via props.
- **pnpm workspaces** — único lockfile na raiz. Nunca rode `npm install` ou `yarn`.

---

## Política de testes

Toda mudança em código de produto — server ou web — deve vir acompanhada de um teste automatizado que cobre o comportamento novo ou alterado, **ou** de uma justificativa explícita de por que testes não se aplicam.

```bash
# server (Vitest)
pnpm --filter vetor-wallet-server test

# web (Vitest — ambiente node, para funções puras extraídas de componentes)
pnpm --filter vetor-wallet-web test
```

| Pacote | Padrão | Exemplo existente |
|---|---|---|
| `server` | `server/src/**/*.test.ts` | `server/src/services/hourlyInsights.test.ts` |
| `web` | `web/src/**/*.test.ts` | `web/src/routes/homeMetrics.test.ts` |

**Não exigem teste novo:** ajustes de estilo/layout, refatoração sem mudança de comportamento, documentação.

**Sempre exigem teste:** nova função de serviço com lógica de negócio, nova rota ou mudança de comportamento, lógica de cálculo.

---

## Pontos de atenção

### `DATABASE_URL` para o CLI e futuro Turso
`server/src/db.ts` usa `process.cwd()/data/wallet.db` por padrão. O CLI roda em `cli/`, então precisa de `DATABASE_URL=file:../server/data/wallet.db` no `cli/.env`. Quando o projeto migrar para Turso, basta apontar `DATABASE_URL` para a URL remota em ambos os ambientes.

### Validação de SELL contra a posição atual
`POST /api/operations` e `POST /api/import` (CSV) rejeitam com `400` qualquer SELL que exceda a posição consolidada **atual** do ticker **na carteira alvo** (soma das operações já registradas naquele `wallet_id`/usuário quando `wallet_id`/`walletId` é informado — independente da data da nova operação; não há validação por data histórica, um SELL retroativo é validado contra a posição de hoje). Ambas as rotas filtram a query de posição por `wallet_id` quando o parâmetro é informado (`wallet_id` no body de `/api/operations`, `walletId` na query string de `/api/import`); sem esse filtro, um usuário com múltiplas carteiras poderia importar/registrar um SELL que excede a posição da carteira alvo mas é coberto pela soma de todas as carteiras. A checagem usa `wouldExceedPosition`/`getPositionQuantity` em `services/portfolio.ts`, reaproveitando o mesmo `buildPositionMap` do cálculo de preço médio (sem duplicar lógica). No CSV, a rejeição é **por linha**: linhas de SELL inválidas entram no relatório de erros (`CsvImportResult.errors`, com número da linha) e o restante do arquivo é importado normalmente. `applyOperation` mantém `Math.max(0, newQty)` como cláusula de defesa (não como validação) — dados históricos podem já conter vendas a descoberto gravadas antes desta validação existir, e o cálculo de posição não pode quebrar/ficar negativo ao processá-los.

### Progresso de metas: manual ou derivado dos aportes vinculados (T-024)
Uma meta tem **duas origens possíveis** de `current_amount`, sinalizadas pelo campo `progress_source` (`'MANUAL' | 'LINKED_SAVINGS'`) que a API devolve junto de `linked_entries_count`:

- **`MANUAL`** — nenhum `savings_entries.goal_id` aponta para a meta. `current_amount` é a coluna da tabela `goals`, editável via `PATCH /api/goals/:id`. É o comportamento pré-T-024 e continua valendo para todas as metas históricas (retrocompatibilidade: nenhuma migração de dados foi feita).
- **`LINKED_SAVINGS`** — existe ao menos um lançamento vinculado. `current_amount` é **derivado** (`SUM(DEPOSIT) − SUM(WITHDRAW)` dos lançamentos vinculados, piso 0, arredondado em centavos) e o `PATCH` de `current_amount` responde `400` explicativo — evita duas fontes de verdade. `name`/`target_amount` continuam editáveis.

Pontos de projeto:

- O valor derivado **não é materializado** em `goals.current_amount`: é calculado a cada leitura em `services/goals.ts`. Consequência desejada: `DELETE /api/savings/:id` de um lançamento vinculado já reflete no progresso, sem job de recálculo.
- `listGoalsWithProgress` faz **duas queries** (metas + `GROUP BY goal_id` agregando os lançamentos do usuário) — nada de N+1 por meta.
- **`YIELD` não pode ser vinculado**: `POST /api/savings` com `goalId` num lançamento de rendimento responde `400`. Rateio de rendimento entre metas está fora de escopo, então "lançamento vinculado" ≡ `DEPOSIT`/`WITHDRAW` e a semântica de "meta derivada" não fica ambígua.
- `goalId` de meta de outro usuário → `404` (mesmo padrão das outras rotas isoladas por `user_id`).
- `savings_entries.goal_id` é **FOREIGN KEY e o libsql aplica a constraint**: `DELETE /api/goals/:id` precisa desvincular (`SET goal_id = NULL`) antes de apagar a meta — na ordem inversa o delete falha com `SQLITE_CONSTRAINT_FOREIGNKEY`. Os lançamentos sobrevivem (o saldo da poupança não muda), só perdem o vínculo.
- O saldo da poupança (`SavingsSummary`) **ignora** o vínculo: um aporte vinculado a meta continua somando no saldo/total de aportes. Meta é uma *visão* sobre os lançamentos, não um cofre separado.

### Transferência da poupança para uma meta (T-041)
`POST /api/savings/transfer-to-goal` reserva para uma meta dinheiro que **já está** na poupança, em vez de exigir um aporte novo. O modelo é um **par atômico** de lançamentos comuns gravado no mesmo `db.batch(..., 'write')`: um `WITHDRAW` sem vínculo e um `DEPOSIT` vinculado à meta, com o mesmo `amount`/`date` e um `transfer_group` (uuid) comum.

- **O saldo não muda** (−X +X). Isso é o ponto, não um efeito colateral: a invariante `saldo = DEPOSIT + YIELD − WITHDRAW` continua valendo e o dinheiro segue na poupança rendendo — ele só passa a estar *reservado* para a meta, coerente com "meta é uma visão sobre os lançamentos, não um cofre separado". Nenhum tipo novo de lançamento e nenhuma coluna de saldo foram criados.
- **A perna de WITHDRAW não pode ter `goal_id`** — invariante nº 1. Com as duas pernas vinculadas, `fetchGoalLinkAggregates` (`services/goals.ts`) somaria +X −X = 0 e o progresso da meta não andaria. Só o DEPOSIT é vinculado, então o progresso sobe exatamente X.
- **Saldo livre** é o conceito complementar **obrigatório**: como o card "Saldo" não muda, sem ele a transferência não teria feedback nenhum. `saldo livre = saldo − Σ max(0, net vinculado por meta)`, **derivado na leitura** (nada persistido, nada materializado — mesma filosofia do progresso de metas da T-024). O piso 0 por meta espelha `resolveGoalProgress`: uma meta cujas retiradas vinculadas superam os aportes não "empresta" reserva negativa para inflar o livre das outras. `YIELD` conta no saldo e nunca na reserva (não pode ser vinculado), logo rendimento é sempre dinheiro livre.
- **A validação é contra o saldo livre, não o total**, e a comparação é em **centavos inteiros** (`Math.round(v * 100)`): em float, transferir exatamente um saldo livre somado de 0,10 + 0,20 seria rejeitado por ruído. Transferir exatamente o saldo livre é caso de sucesso (coberto por teste).
- **Custo aceito e documentado**: `totalDeposits` e `totalWithdrawals` do `summary` sobem X cada. Preferiu-se isso a inventar um terceiro tipo de lançamento ou uma coluna `source` que todo consumidor precisaria conhecer. O `SavingsSummary` ficou **inalterado** (vários testes comparam o objeto inteiro com `toEqual`); o saldo livre é calculado por quem exibe.
- **Duplicação intencional server/web**: `server/src/services/savings.ts` (`sumReservedByGoal`, `computeFreeBalance`, `toCents`) e `web/src/routes/savingsTransfer.ts` (as mesmas + `validateTransfer`, `isTransferLeg`), cada uma com teste próprio — mesmo motivo de `normalizeCategory` (T-028): `shared/` é types-only por construção. **As duas cópias devem mudar juntas.** No web, o `balance` vem do `summary` do server (fonte única do saldo) e só a parcela reservada é derivada dos `entries`.
- **`transfer_group` é procedência, não invariante**: serve ao selo `⇄ transferência` que a lista mostra nas duas pernas (espírito do `↻ recorrente` da T-035). O `PATCH /api/savings/:id` **não** aceita o campo e nada é validado entre as pernas — **cada perna é editável e excluível sozinha**, sem cascata e sem "desfazer". Consequências aceitas (cobertas por teste): apagar só o WITHDRAW faz o dinheiro "voltar" ao saldo e a meta continua com o progresso; apagar só o DEPOSIT derruba o saldo e o progresso. Apagar a **meta** desvincula as duas pernas (o `DELETE /api/goals/:id` já fazia isso) e o saldo fica intacto.
- **Corrida aceita e documentada**: duas transferências simultâneas podem, em teoria, furar o saldo livre (a leitura do razão e o batch não são um só lock). É um app single-user; nenhum lock foi adicionado.
- Na UI de `/poupanca`: 4º card de resumo "Saldo livre" (com sublabel "R$ Y reservados em metas", exibindo `max(0, livre)` — bases legadas podem ter livre negativo e a tela nunca deve mostrar `NaN` nem `-R$`), e um **card dedicado** "Transferir para uma meta" (não um checkbox no form de novo lançamento: a operação grava duas pernas e tem validações próprias), desabilitado com hint quando não há meta cadastrada ou o saldo livre é ≤ 0. Se a meta escolhida ainda é `MANUAL` com `current_amount > 0`, o card **avisa** que a primeira transferência a converte para `LINKED_SAVINGS` e o valor manual passa a ser ignorado (a regra do server não muda). O card de meta em `/metas` tem o atalho `⇄ Aportar da poupança` → `/poupanca?meta=<id>`, lido por `useSearchParams` para pré-selecionar a meta.
- **Data futura é aceita** (nenhuma regra nova foi inventada, como em todo o resto do app).
- **Fora de escopo (segue pendente)**: desfazer/cascata do par, transferir de volta da meta para a poupança, rateio de rendimento entre metas e materializar o progresso.

### Previsão de rendimento da poupança é client-side (T-040)
O card "Previsão de rendimento" em `/poupanca` simula quanto o dinheiro rende num prazo escolhido pelo usuário. **Nenhum endpoint novo**: tudo é calculado no browser por funções puras em `web/src/routes/savingsProjection.ts` (testadas em `savingsProjection.test.ts`), e a simulação **não é persistida**.

- `projectSavings(initial, monthlyRatePct, months)` → `{ futureValue, totalYield }` por juros compostos mensais (`VF = VP × (1 + i)^n`), arredondados em centavos sem divergência entre si (`round((inicial + totalYield)*100) === round(futureValue*100)` — igualdade estrita em float não vale para valores grandes; testes devem comparar em centavos). **Aporte mensal recorrente não entra** (fora de escopo) — só valor inicial × taxa × tempo. Devolve `null`, em vez de `NaN` na tela, para entrada não finita, negativa, `months` não inteiro ou resultado que estoura `number`. `months = 0` e taxa `0` são entradas **válidas** (rendimento 0).
- `deriveMonthlyRatePct(entries)` pré-preenche o campo de taxa a partir do histórico. Heurística: agrupa os `YIELD` por mês, divide o rendimento do mês pelo **saldo no início daquele mês** (`DEPOSIT + YIELD − WITHDRAW` das datas anteriores ao dia 1 — usar o saldo inicial evita que o próprio rendimento ou um aporte no meio do mês achate a taxa), descarta meses com base ≤ 0 e devolve a média aritmética dos até `RATE_SAMPLE_MONTHS` (6) meses elegíveis mais recentes, em pontos percentuais com 4 casas. Histórico insuficiente → `null`, e a UI deixa o campo vazio com placeholder. Sem teto: uma taxa atípica é exibida (o campo é editável) em vez de mascarada.
- Os inputs aceitam vírgula decimal. `parseMoneyInput` de `inlineEdit.ts` **não** serve aqui porque rejeita `0`, que numa simulação é legítimo — daí `parseNonNegativeInput`/`parseMonthsInput` no mesmo arquivo da projeção.
- Os defaults (valor inicial = saldo do `summary`, taxa = derivada) chegam depois do fetch, então são aplicados por efeito **só enquanto o usuário não tocou no campo** (`simTouched`) — digitar não é sobrescrito pelo refetch. `formatDecimalInput(valor, casas)` formata esses defaults com vírgula decimal (2 casas para o valor inicial, 4 para a taxa derivada — mesma resolução de `deriveMonthlyRatePct`), consistente com o que `parseNonNegativeInput` aceita de volta (T-047).
- **`initial === 0` é curto-circuitado** em `projectSavings`, antes da potência: sem isso, taxa e/ou prazo extremos fariam `Math.pow` estourar para `Infinity` e `0 × Infinity = NaN` devolveria `null` para uma simulação (saldo zerado) perfeitamente válida (T-047).
- **O mês corrente é excluído da amostra de `deriveMonthlyRatePct`** (T-047): seu rendimento é parcial (o mês ainda não fechou) e entraria como uma taxa artificialmente baixa, achatando a média dos meses fechados.
- Sem gráfico (decisão do humano) e sem comparação com CDI/Ibovespa (fora de escopo).

### Despesas fixas × lançamentos variáveis
O layer `/despesas` soma **duas** fontes diferentes: `fixed_expenses` (itens fixos mensais, **sem data** — valem integralmente para qualquer mês exibido) e `expense_entries` (gastos datados, filtrados por mês). O **total do mês exibido é fixas + variáveis daquele mês** — calculado por `computeMonthTotals` em `web/src/routes/expenseMonth.ts` (função pura, testada), não inline no componente. A navegação de mês é estado local da `DespesasPage`: trocar o mês recarrega só os lançamentos (`GET /api/expense-entries?month=`), pois as fixas não dependem do mês. Consequência esperada: navegar para um mês passado/futuro não altera a parcela de fixas do total — não há histórico de quando uma despesa fixa passou a existir. O filtro mensal no server usa `substr(date, 1, 7) = ?` (compatível com o índice `idx_expense_entries_user_date` apenas parcialmente — se a tabela crescer muito, trocar por range `date >= ? AND date < ?`). O mês default é calculado no fuso local do processo (`currentMonth`), não em UTC, para não virar o mês antes da hora no BRT.

### Recorrência de lançamentos de despesa: materialização lazy e idempotente (T-035)
Uma despesa variável que se repete todo mês (assinatura, mensalidade) é cadastrada uma vez e as ocorrências dos meses seguintes aparecem sozinhas. As decisões de projeto:

- **Modelo: template + livro-razão, ocorrências são lançamentos normais.** `recurring_expenses` guarda só o template (descrição, categoria normalizada, valor, `day_of_month`, `start_month`, `active`). Cada ocorrência é uma linha comum de `expense_entries` com `recurring_id` preenchido — logo entra nos totais, no orçamento por categoria e no histórico sem nenhum caso especial, e pode ser editada/excluída individualmente pela T-031. **Não** existe "valor efetivo herdado do template": editar a ocorrência de agosto para 175,50 não muda a de setembro (que continua saindo com o valor do template).
- **Criação sempre acoplada ao lançamento.** Não há `POST /api/recurring-expenses`; a recorrência nasce em `POST /api/expense-entries` com `recurring: true`. Assim a **primeira ocorrência é o próprio lançamento criado**, já registrada no livro-razão — sem isso o primeiro GET do mês do lançamento geraria uma segunda cópia idêntica. `dayOfMonth` opcional sobrepõe o dia derivado de `date`.
- **O piso (`start_month`) é o mês de CRIAÇÃO, não o mês do lançamento** — `max(mês de date, mês corrente)`. Marcar como recorrente um lançamento com data passada é caminho normal da UI (navegar para um mês passado deixa o campo de data em `${mês}-01`), e usar o mês do lançamento como piso faria o próprio handler — via o `refreshHistory()` → `/summary` que ele dispara — gerar ocorrências reais em **meses já fechados**, reescrevendo total, orçamento e histórico daqueles meses sem o usuário ver. Data **futura** continua valendo como piso: a recorrência só começa quando o lançamento acontece. O livro-razão marca o mês do **lançamento** (e não `start_month`): num cadastro retroativo os dois divergem, e marcar o mês corrente suprimiria a ocorrência que a recorrência deve gerar agora. O web espelha a regra em `recurrenceStartMonth`/`startsLaterThanEntry` (`web/src/routes/recurrence.ts`) só para avisar, no form, que a repetição vai começar no mês corrente.
- **A idempotência é do banco, não do código.** `recurring_expense_months` tem `UNIQUE(recurring_id, month)`. A reserva do mês e o `INSERT` da ocorrência vão no **mesmo `db.batch(..., 'write')`** (transacional): se fossem escritas independentes, uma falha entre elas deixaria o mês marcado como gerado para sempre, sem ocorrência e sem caminho de reparo — indistinguível de uma ocorrência excluída de propósito. A reserva é um `INSERT` **sem** `OR IGNORE`: é a violação da chave única que sinaliza "outra request chegou primeiro", derruba o batch inteiro e faz o perdedor da corrida não inserir nada (`isUniqueViolation` distingue esse caso de qualquer outro erro de banco, que continua subindo como 500). Antes do laço, uma única query carrega os pares (recorrência, mês) já gerados — a violação é a rede de segurança contra concorrência, não o caminho normal. O perdedor pode responder aquele mês sem a ocorrência que o vencedor acabou de gravar; o GET seguinte já a mostra.
- **Excluir uma ocorrência não a recria** — e é por isso que o controle é uma tabela própria, não um índice único sobre `expense_entries`: a chave de controle sobrevive ao `DELETE` do lançamento. Com um índice único sobre as ocorrências, apagar a ocorrência liberaria a chave e o próximo GET a materializaria de novo, tornando a exclusão impossível na prática. Consequência aceita: não há como "recuperar" uma ocorrência excluída sem criar um lançamento à mão.
- **Onde a materialização roda**: `GET /api/expense-entries?month=` (o mês pedido) e `GET /api/expense-entries/summary` (todos os meses da janela agregada), sempre **antes** da leitura, para que as ocorrências geradas apareçam na mesma resposta. O `month` inválido é rejeitado com `400` antes de qualquer escrita. Efeito colateral desejado: a Home também chama `GET /api/expense-entries?month=` (T-025), então abrir a Home já materializa o mês corrente e a "sobra do mês" real considera as recorrências.
- **Meses futuros são materializados** (decisão): navegar ‹/› para frente em `/despesas` mostra a assinatura que já se sabe que vai cair lá — é o que o usuário espera ao planejar. `/summary` nunca gera mês futuro porque sua janela termina no mês corrente. Há um **teto de horizonte** (`MATERIALIZATION_HORIZON_MONTHS = 12`, em `routes/expenseEntries.ts`): o `month` da query só é limitado pelo formato, então um `?month=9999-12` escreveria ocorrências indefinidamente à frente. Meses além do horizonte continuam sendo listados, apenas não geram nada.
- **Meses anteriores a `start_month` nunca são gerados**: navegar para trás não inventa histórico, e cadastrar retroativamente não preenche os meses intermediários (coberto por teste).
- **Dia ajustado para meses curtos**: `occurrenceDate` (em `services/recurringExpenses.ts`, função pura testada) faz `min(day_of_month, dias do mês)` — dia 31 cai em 28/02 (29/02 em ano bissexto) e em 30/04. A ocorrência nunca transborda para o mês seguinte, senão não pertenceria ao mês consultado.
- **Encerrar é soft e para tudo o que ainda não foi gerado** — inclusive meses passados nunca visitados, não só os futuros. As ocorrências já materializadas ficam (são lançamentos comuns). `DELETE /api/recurring-expenses/:id` é alias de `PATCH { active: false }` e nunca apaga a linha: as ocorrências a referenciam por FK e o livro-razão precisa continuar existindo. Encerrar duas vezes é idempotente.
- **Reativar responde `400`** (crie outra recorrência): reativar reabriria a janela de meses entre o encerramento e hoje, que seriam materializados de uma vez no GET seguinte.
- **Editar o template está fora de escopo** — o `PATCH` só aceita `active`. Mudar valor/dia afetaria as ocorrências futuras e não as passadas, e a semântica dessa assimetria precisa de decisão de produto antes.
- No web, o checkbox "Repetir todo mês" vive no form de novo lançamento; as ocorrências ganham o selo `↻ recorrente` na lista (via `isRecurringOccurrence`), e o card "Recorrências mensais" lista as ativas com botão Encerrar. Helpers puros e testados em `web/src/routes/recurrence.ts`.
- **Fora de escopo (segue pendente)**: recorrência em renda/poupança, frequências além de mensal, edição em massa de ocorrências passadas e retroagir a recorrência para antes da criação.

### Histórico mensal sem gráfico (T-033)
A seção "Últimos meses" em `/despesas` mostra os últimos `HISTORY_MONTHS` (6) meses — total = fixas vigentes **hoje** + variáveis daquele mês — sem nenhum gráfico (decisão do humano, `TODO-HUMANO.md`). `GET /api/expense-entries/summary?months=N` agrega só os lançamentos variáveis por mês (`GROUP BY substr(date,1,7)`); **meses sem lançamento ficam ausentes** da resposta — decisão de projeto para manter a query simples (não precisa gerar uma série completa no SQL). Quem preenche os N meses pedidos com variável = 0 é a função pura `buildMonthlyHistory` (`web/src/routes/expenseMonth.ts`, testada), que também junta o total de fixas (constante nas N linhas, pois não há histórico de fixas) e monta os rótulos via `shiftMonth`/`formatMonthLabel` já existentes de T-022 — sem duplicar essa lógica. O histórico é buscado uma vez no mount e **revalidado após criar/editar/remover um lançamento** (`refreshHistory()` nos três handlers de `expense_entries`) — sem isso, lançar/editar/apagar no mês corrente atualiza o "Total do mês" mas deixaria a linha "atual" do histórico com um valor contraditório até um reload. Não recarrega ao navegar de mês (‹/›), pois é relativo ao mês corrente real, não ao mês exibido. Cada linha é clicável: chama `applyMonth(row.month)`, a mesma função que a navegação ‹/› usa internamente (`goToMonth` virou um wrapper dela), reaproveitando o mesmo `monthKey`/side effects (recalcula a data default do form e cancela edição aberta).

Ponto de atenção conhecido (não corrigido nesta tarefa): a janela dos N meses é ancorada no mês calculado pelo **server** (`currentMonth()`, fuso do processo), enquanto as linhas são montadas com o mês do **browser** (`currentMonthKey()`, fuso do cliente). Em fusos divergentes, bem na virada de mês, a linha "atual" pode aparecer zerada por alguns instantes (o server ainda não considera o novo mês corrente, então ele não entra na janela agregada). Solução futura: o cliente informar `endMonth` explicitamente no lugar de o server inferir sozinho.

### Orçamento por categoria × mês exibido
Decisão do humano (T-037, 2026-07-25): a seção "Orçamento do mês" (barras de progresso, form de criação/upsert e botão de remover) foi removida do render de `DespesasPage.tsx` — "não entendi a utilidade do orçamento do mês". O backend segue intacto: `server/src/routes/budgets.ts`, `web/src/routes/budgetProgress.ts` e todos os testes de ambos continuam ativos, aguardando redesign futuro (mesmo padrão da T-026 com Alertas/Import).

`GET /api/budgets` não tem parâmetro de mês — o teto de `category_budgets` vale indefinidamente até ser substituído (upsert) ou removido. Quem varia por mês é o **gasto** comparado ao teto: `computeBudgetProgress` (`web/src/routes/budgetProgress.ts`, função pura testada) soma despesas fixas da mesma categoria (`fixed_expenses`, sem data) + lançamentos variáveis da categoria já filtrados pelo mês exibido (`expense_entries` via `GET /api/expense-entries?month=`). Trocar de mês em `DespesasPage` recalcula a barra de progresso porque `entries` é recarregado, mas os orçamentos e as fixas permanecem os mesmos. O percentual exibido no texto não é limitado a 100% (pode mostrar 140%), mas a largura visual da barra é (`pctClamped`), com a cor trocando para `--color-warn` quando `pct >= 100`.

### Categoria é normalizada nas 3 telas de despesas/orçamento (T-028)
As três fontes que usam categoria como **texto livre** — despesas fixas (`fixed_expenses.category`), lançamentos variáveis (`expense_entries.category`) e orçamentos (`category_budgets.category`) — compartilham uma única forma canônica: `normalizeCategory` = NFC + `trim` + colapso de espaços internos + `toLocaleLowerCase('pt-BR')`. "Mercado", "mercado", "mercado " e "MERCADO" são a **mesma** categoria; um orçamento de "Mercado" soma os gastos lançados em "mercado".

Decisões de projeto:

- **A forma normalizada é a forma ARMAZENADA**, não uma chave paralela ao valor exibido. Consequência: toda comparação volta a ser `===` de string (em SQL e em JS) sem que nenhum dos pontos precise lembrar de normalizar, e o `UNIQUE(user_id, category)` de `category_budgets` garante unicidade lógica sozinho — o upsert de "Mercado" substitui o registro de "mercado" em vez de duplicar. Não foi preciso coluna de chave nem índice por expressão (`lower()`/`COLLATE NOCASE` do SQLite são ASCII-only e não dobrariam "SAÚDE"/"saúde"; `toLocaleLowerCase` dobra). Custo aceito: a caixa digitada não é preservada, então o web recapitaliza só a primeira letra na exibição via `formatCategoryLabel` ("IPTU" aparece como "Iptu").
- **A função é duplicada de propósito**: `server/src/services/categories.ts` e `web/src/routes/categories.ts`, cada uma com teste próprio. `shared/` é types-only por construção (`emitDeclarationOnly: true`, sem `main`; server e web só fazem `import type` dele) — exportar função de runtime de lá quebraria `server/dist` e o bundle do web. As duas cópias devem mudar juntas.
- **Gravação normalizada** nas rotas `POST /api/expenses`, `POST /api/expense-entries` e `POST /api/budgets`. Em budgets, a validação de "category obrigatória" (400) usa o valor já normalizado, então `"   "` continua sendo rejeitado.
- **Migração idempotente no `initDb()`** (`normalizeExistingCategories` em `server/src/db.ts`), rodando a cada boot: reescreve as categorias das três tabelas na forma canônica. Idempotente por construção — na segunda execução nada mais difere, nenhum UPDATE/DELETE é emitido (não há flag de "migração já rodou"). A normalização pode **colidir** no `UNIQUE(user_id, category)` de `category_budgets` ("Mercado" + "mercado" do mesmo usuário → "mercado"): a regra é **vence o registro de maior `id`** (o mais recente; desempate por `id` e não por `created_at`, que tem resolução de segundos) e os demais da mesma categoria canônica são **apagados**. Os perdedores são deletados antes de o vencedor ser atualizado — na ordem inversa o UPDATE colidiria com o UNIQUE ainda ocupado.
- **O web também normaliza** em `groupByCategory` (`expensesGrouping.ts`) e `computeBudgetProgress` (`budgetProgress.ts`) — defesa contra dados legados exibidos antes de a migração ter rodado naquele banco e contra o estado otimista da `DespesasPage`. Ambas devolvem em `category` o rótulo já pronto para exibição (`formatCategoryLabel`), com fallback "Sem categoria" no agrupamento.
- **Fora de escopo (segue pendente)**: autocomplete/select de categorias já usadas e renomear categoria em massa pela UI. Duas fixas gravadas antes da migração continuam sendo dois registros distintos com o mesmo nome canônico — a normalização une o *agrupamento*, não os registros.

### Edição inline nos layers básicos (T-031)
As quatro entidades dos layers básicos — renda (`/api/income`), despesas fixas (`/api/expenses`), lançamentos variáveis (`/api/expense-entries`) e lançamentos de poupança (`/api/savings`) — aceitam **PATCH parcial**, no mesmo formato de `PATCH /api/goals/:id`: todos os campos opcionais, corpo sem nenhum campo conhecido responde `400`, cada campo informado passa pela **mesma validação da criação** (`Number.isFinite` + `> 0` para dinheiro — T-029; `category` gravada normalizada por `normalizeCategory` — T-028) e o registro é localizado por `id AND user_id`, então o PATCH de um registro de outro usuário responde `404` (não vaza existência).

Semântica do PATCH em `savings` com meta vinculada — o ponto delicado da tarefa:

- O progresso da meta é **derivado na leitura** (T-024, não materializado), então editar `amount`/`type`/vínculo reflete na meta sem nenhum recálculo: um aporte vinculado de 100 editado para 175,50 muda o `current_amount` da meta na próxima leitura. Isso está coberto por teste explícito em `savings.test.ts`, junto do caso de um DEPOSIT vinculado virando WITHDRAW (que inverte o sinal no progresso).
- As invariantes do vínculo são avaliadas sobre o **estado resultante** do PATCH, não só sobre o corpo: `effectiveType = type ?? atual` e `effectiveGoalId = 'goalId' informado ? goalId : atual`. Consequências: `{ type: 'YIELD' }` num lançamento vinculado responde `400` (a regra "YIELD não pode ser vinculado" da criação continua valendo depois da edição); `{ goalId: <id> }` num lançamento que já é YIELD também responde `400`; e `{ type: 'YIELD', goalId: null }` no mesmo request é **aceito** — desvincular explicitamente é o jeito de converter um aporte vinculado em rendimento.
- `goalId` tem três estados distintos, e por isso o campo é `number | null | undefined`: **ausente** preserva o vínculo atual, **`null`** desvincula, **um id** revincula (com checagem de posse → `404` se a meta for de outro usuário). A posse só é consultada quando o vínculo muda de fato — revalidar o id já gravado seria uma query extra sem ganho.
- A UI de `/poupanca` evita o `400` do primeiro caso em vez de esperá-lo: trocar o tipo para Rendimento limpa o select de meta e exibe um aviso de que salvar vai desvincular o lançamento (o PATCH sai com `goalId: null`). O `400` do server continua sendo a garantia de integridade para qualquer outro cliente.

No web, as 4 telas ganharam **modo de edição no item da lista** (lápis → campos preenchidos → salvar/cancelar), reusando os mesmos `.vw-layerpage-field`/`.vw-layerpage-error` dos forms de criação. Dois helpers puros em `web/src/routes/inlineEdit.ts` (testados) evitam repetir a mesma lógica quatro vezes: `parseMoneyInput` (aceita vírgula decimal, rejeita o que o server rejeitaria) e `diffEditableFields`, que reduz o rascunho aos campos alterados — **um rascunho salvo sem nenhuma alteração fecha o modo de edição sem chamar a API**, já que um PATCH vazio responderia 400. Detalhes de estado: em `/despesas`, editar a categoria de uma fixa reagrupa a lista pelo `groupByCategory` sem refetch (a resposta já vem normalizada) e editar a data de um lançamento para fora do mês exibido **remove o item da lista** (o server não o devolveria naquele mês); navegar de mês cancela um rascunho aberto. Em `/poupanca`, salvar refaz o fetch em vez de remendar o estado, porque `summary` e progresso de meta são derivados no server. Enquanto um item está em edição, os botões de editar/remover dos outros itens ficam desabilitados (um rascunho aberto por vez).

Fora de escopo (segue pendente): editar operações de ações, histórico/auditoria de edições e edição em massa.

### Renda fixa × lançamentos de renda variável (T-036)
O layer `/renda` soma **duas** fontes diferentes, espelhando exatamente o que a T-022 fez em despesas: `income_sources` (fontes fixas mensais, **sem data** — valem integralmente para qualquer mês exibido) e `income_entries` (renda avulsa datada: freela pontual, venda, bônus, filtrada por mês). O **total do mês exibido é fixas + variáveis daquele mês** — calculado por `computeIncomeMonthTotals` em `web/src/routes/incomeMonth.ts` (função pura, testada), não inline no componente. A navegação de mês é estado local da `RendaPage`: trocar o mês recarrega só as rendas variáveis (`GET /api/income-entries?month=`), com a mesma guarda de resposta obsoleta da T-030 (`latestRequestedMonthRef`), pois as fixas não dependem do mês.

Decisões de projeto:

- **Nada de helper de mês duplicado**: `RendaPage` importa `currentMonthKey`/`shiftMonth`/`formatMonthLabel`/`formatDayMonth` de `expenseMonth.ts` — esses helpers não são específicos de despesas. Só o cálculo de total ganhou arquivo próprio (`incomeMonth.ts`), porque os tipos das duas fontes são diferentes. No server, `routes/incomeEntries.ts` importa `currentMonth` de `routes/expenseEntries.ts` pelo mesmo motivo (mover o helper para um service exigiria editar a rota de despesas, fora do escopo da T-036) — se um dia surgir um terceiro consumidor, extrair para `services/months.ts`.
- **Sem categoria e sem recorrência** em renda variável (fora de escopo): não há `normalizeCategory` nem materialização lazy aqui, então `GET /api/income-entries` é leitura pura (nenhuma escrita antes do SELECT, diferente do endpoint de despesas).
- Mesma consequência esperada da simetria: navegar para um mês passado/futuro não altera a parcela de fixas do total — não há histórico de quando uma fonte fixa passou a existir. Também **não há** histórico multi-mês em `/renda` (o "Últimos meses" da T-033 é só de despesas).

### Sobra do mês na Home é real, não só estimada (T-025, atualizada na T-036)
O hero da Home (`web/src/routes/HomePage.tsx`) busca também `GET /api/expense-entries?month=` e `GET /api/income-entries?month=` (mês corrente via `currentMonthKey()` de `expenseMonth.ts`, fuso local) e calcula a sobra do mês com `computeMonthCashFlow` (`web/src/routes/homeMetrics.ts`):

- `realBalance = (renda fixa + rendas variáveis do mês) − despesas fixas − despesas variáveis do mês`
- `estimatedBalance` (sobra **prevista**) continua sendo `renda fixa − despesas fixas`: o que é avulso, dos dois lados, não é previsível.
- `incomeTotal` = renda fixa + rendas variáveis do mês — é o que o card "Renda" (hero e card de layer) exibe; `expensesTotal` = fixas + variáveis, como já era.

O card "Sobra do mês" mostra o valor real com um sublabel comparando à prevista. As duas buscas mensais seguem o padrão `Promise.allSettled` das demais chamadas da Home (T-008) e falham **de forma independente**: `variableEntries`/`variableIncomeEntries` ficam `null` e cada lado é somado como 0 (nunca `NaN`), com uma flag de load própria — `entriesLoaded` (despesas, nome herdado da T-025/T-030) e `incomeEntriesLoaded` (rendas). O aviso discreto no sublabel aparece quando qualquer uma das duas flags é false, e só depois do primeiro carregamento (`!loading`), senão piscaria sempre. Sem gráficos ou histórico multi-mês na Home (decisão do humano — ver `TODO-HUMANO.md`).

### Sessões persistem no restart (T-034)
`express-session` usa `SqliteSessionStore` (`server/src/auth/sessionStore.ts`), uma implementação da interface `Store` sobre o mesmo `@libsql/client`/arquivo SQLite do app — não mais o `MemoryStore` padrão. Sessões sobrevivem a restart do server porque ficam gravadas na tabela `sessions` (`sid` PK, `data` TEXT JSON, `expires_at`; criada em `initDb()`, idempotente como as demais).

Pontos de projeto:

- **TTL** é derivado de `cookie.maxAge` (ms) — a mesma configuração que já existia (`7 * 24 * 60 * 60 * 1000` em `index.ts`). Fallback de 24h **apenas** quando `maxAge` está ausente/não numérico; `maxAge <= 0` (finito) expira a sessão imediatamente (T-046), tanto no `set` quanto no `touch` — a linha já-morta é gravada e some via lazy-delete/varredura (escolha consciente, coerente com o modelo do Store).
- **Fail-closed**: `expires_at` corrompido/não-ISO no `get` é tratado como sessão expirada (retorna `null` e apaga a linha), nunca revive a sessão nem lança síncrono (T-046). A varredura de boot vive em `cleanupExpiredSessions` (exportada e testada diretamente).
- **Expiração**: `get` faz lazy-delete — uma sessão com `expires_at` no passado retorna `null` e a linha é apagada na mesma chamada. Além disso, `initDb()` roda uma varredura de limpeza no boot (`DELETE FROM sessions WHERE expires_at <= <ISO agora>`) para não acumular sessões expiradas de execuções antigas que nunca mais serão lidas.
- **`touch`** (usado por `rolling`/renovação) atualiza só `expires_at`, sem reescrever `data`.
- **Callbacks nunca lançam síncrono** — todo método do Store é promise-based internamente e delega erro ao callback (`cb(err)`); um throw síncrono aqui derrubaria o server, já que o `express-session` não envolve as chamadas em `try/catch`.
- `expires_at` é gravado como ISO string (UTC) e a varredura de boot compara contra um parâmetro também ISO — nunca contra `datetime('now')` do SQLite (formatos com separador `T` vs espaço não comparam de forma lexicográfica consistente entre si).
- Sem dependência nova — a interface `Store` do `express-session` já era exposta pelo próprio pacote (`import { Store } from 'express-session'`).
- Continua valendo para produção multi-instância/Turso: como o driver já é `@libsql/client`, apontar `DATABASE_URL` para Turso persiste sessões do mesmo jeito, sem trocar nada no Store. Redis/Cognito seguem fora de escopo (seriam necessários só para requisitos que o SQLite não cobre, como sessão compartilhada entre múltiplos processos/regiões).

### Falha de cotações agora é sinalizada (antes silenciosa)
`fetchQuotes` (`server/src/services/quotes.ts`) continua **não derrubando a request** em erro de rede/timeout/resposta não-ok da brapi — mas agora retorna `{ quotes, failed }` em vez de só o `Map`. `failed: true` sinaliza que a busca falhou por completo (distinto de um ticker pontual vir ausente numa resposta bem-sucedida). `routes/portfolio.ts` propaga isso para `buildPortfolioSummary(positionMap, quotes, failed)`, que seta `PortfolioSummary.quotesUnavailable` (campo opcional). Posições sem cotação continuam exibindo `null` nos campos de valor atual e P&L; o dashboard (`PortfolioDashboard.tsx`) mostra um banner discreto (`--color-warn`) quando `quotesUnavailable` está ativo.

### Job de insights horários sem agendador automático
O CLI `pnpm --filter vetor-wallet-cli insights:hourly` precisa ser invocado manualmente ou via cron do SO até o deploy em AWS Lambda + EventBridge (issue futura).

### `AlertsPanel` e `CsvImport` sem UI (T-026)
Decisão do humano (`TODO-HUMANO.md`, 2026-07-24, opção b): os componentes `AlertsPanel` e `CsvImport` foram removidos do render de `DashboardPage.tsx`, mas os arquivos, `utils/alerts.ts` e as rotas `/api/alerts` e `/api/import` do server continuam ativos e intactos — aguardando redesign futuro antes de voltarem à UI.
