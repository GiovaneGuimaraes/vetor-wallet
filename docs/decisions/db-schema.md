# Schema do banco

> Extraído do CLAUDE.md raiz. O schema é gerenciado em `packages/server/src/db/schema.ts > initDb()` via `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE` idempotentes; migrações de dados em `db/migrations.ts`.

Gerenciado em `packages/server/src/db/ > initDb()` via `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE` idempotentes.

```sql
-- Usuários
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT    NOT NULL UNIQUE,
  password_hash TEXT   NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Carteira do usuário. Desde a T-050 é UMA por usuário — invariante de
-- APLICAÇÃO (POST /api/wallets recusa a segunda), sem UNIQUE(user_id): o
-- índice quebraria o boot de bases legadas que já têm 2+. Ver "Carteira única".
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
-- ALTER idempotente: external_id TEXT
--   id da transação na ORIGEM (T-084): 'ofx:<FITID>', 'pluggy:<id>'.
--   NULL = lançamento digitado à mão (maioria das linhas).
CREATE UNIQUE INDEX IF NOT EXISTS idx_income_entries_user_external
  ON income_entries(user_id, external_id) WHERE external_id IS NOT NULL;

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
-- ALTER idempotente: external_id TEXT
--   id da transação na ORIGEM (T-084): 'ofx:<FITID>', 'pluggy:<id>'.
--   NULL = lançamento digitado à mão (maioria das linhas).
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_entries_user_external
  ON expense_entries(user_id, external_id) WHERE external_id IS NOT NULL;
-- Os dois índices acima são PARCIAIS (T-084): o `WHERE external_id IS NOT NULL`
-- restringe o índice às linhas importadas e deixa a intenção explícita (em
-- SQLite NULLs nunca colidem num UNIQUE). O par é (user_id, external_id) —
-- dois usuários podem importar o MESMO FITID sem conflito. Os ALTERs vêm ANTES
-- destes CREATE INDEX em initDb(), senão o primeiro boot falha com
-- `no such column`.

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

-- ─────────────────────────────────────────────────────────────────────────
-- Billing / Assinatura Pix (T-069)
-- ─────────────────────────────────────────────────────────────────────────
-- ATENÇÃO — neste layer dinheiro é CENTAVOS (INTEGER), nunca REAL. A API
-- da AbacatePay transaciona valores inteiros em centavos; arredondar de/para
-- REAL abriria espaço para divergência de 1 centavo entre registro do app e
-- o que o PSP cobrou (reconciliação quebrada). Aqui a representação segue a
-- do provedor; converter para reais é papel da camada de apresentação.

-- Catálogo global de planos — sem vínculo de usuário.
CREATE TABLE IF NOT EXISTS plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL,                              -- chave estável ('pro_monthly', 'pro_yearly')
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL,                              -- em CENTAVOS
  interval    TEXT    NOT NULL CHECK(interval IN ('monthly', 'yearly')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_code ON plans(code);

-- Uma assinatura por usuário (T-050: decisão de carteira única replicada aqui).
-- Trocar de plano é UPDATE da linha existente (plan_id/status), nunca uma
-- segunda linha; sem isso "qual é o plano do usuário?" deixa de ter resposta única.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id),
  plan_id            INTEGER NOT NULL REFERENCES plans(id),
  status             TEXT    NOT NULL DEFAULT 'pending'
                             CHECK(status IN ('pending', 'active', 'expired', 'canceled')),
  current_period_end TEXT,                                   -- SQLite UTC 'YYYY-MM-DD HH:MM:SS', ou null
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

-- Cobrança Pix gerada para uma assinatura. Provém da API da AbacatePay via
-- external_id = id local; webhook e polling (`GET /api/pix-charges/:id`)
-- consultam status aqui.
CREATE TABLE IF NOT EXISTS pix_charges (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  plan_id           INTEGER NOT NULL REFERENCES plans(id),
  abacate_charge_id TEXT    NOT NULL,                        -- id único no provedor
  amount_cents      INTEGER NOT NULL,                        -- em CENTAVOS
  status            TEXT    NOT NULL DEFAULT 'PENDING'
                           CHECK(status IN ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED')),
  br_code           TEXT    NOT NULL DEFAULT '',             -- payload Pix copia-e-cola
  br_code_base64    TEXT    NOT NULL DEFAULT '',             -- QR Code base64
  expires_at        TEXT,                                    -- SQLite UTC ou null
  paid_at           TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pix_charges_abacate_id
  ON pix_charges(abacate_charge_id);
-- Leitura típica: "a cobrança PENDING mais recente deste usuário"
CREATE INDEX IF NOT EXISTS idx_pix_charges_user_status
  ON pix_charges(user_id, status, created_at);

-- Log idempotente de webhook. Evento recebido → `INSERT OR IGNORE` aqui;
-- duplicata é ignorada (UNIQUE(event_id)) e o efeito colateral (ativar
-- assinatura) não é reaplicado.
CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    TEXT NOT NULL,
  event_type  TEXT NOT NULL DEFAULT '',
  charge_id   TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_webhook_events_event
  ON billing_webhook_events(event_id);
```

Driver: `@libsql/client` (libsql/SQLite). Sem ORM; queries são SQL puro.

---

