import { db } from './client';
import { normalizeExistingCategories, seedPlans } from './migrations';
import { cleanupExpiredSessions } from './sessionStore';

export async function initDb() {
  await db.batch(
    [
      {
        sql: `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS operations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticker TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL')),
          quantity REAL NOT NULL,
          price REAL NOT NULL,
          date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS alert_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticker TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('PRICE_ABOVE','PRICE_BELOW','CHANGE_PCT','ALLOCATION_PCT')),
          threshold REAL NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        args: [],
      },
    ],
    'write'
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS quote_snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker      TEXT    NOT NULL,
      price       REAL    NOT NULL,
      captured_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Expression-based unique constraints must be separate indexes in SQLite
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_unique_day
     ON quote_snapshots(ticker, date(captured_at))`
  );

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_snapshots_ticker_time
     ON quote_snapshots(ticker, captured_at)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS hourly_quote_insights (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker      TEXT    NOT NULL,
      quote_date  TEXT    NOT NULL,
      hour        INTEGER NOT NULL CHECK(hour BETWEEN 0 AND 23),
      price       REAL    NOT NULL,
      captured_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_hourly_insights_unique
     ON hourly_quote_insights(ticker, quote_date, hour)`
  );

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_hourly_insights_ticker_date
     ON hourly_quote_insights(ticker, quote_date)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS wallets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      color       TEXT    NOT NULL DEFAULT '#e3d5b8',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS income_sources (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      name       TEXT    NOT NULL,
      type       TEXT    NOT NULL DEFAULT 'OUTRO' CHECK(type IN ('SALARIO', 'FREELA', 'OUTRO')),
      amount     REAL    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // T-036: renda avulsa datada (freela pontual, venda, bônus) — espelho de
  // expense_entries para o layer Renda. Distinta de income_sources, que é um
  // item fixo mensal sem data e vale para todo mês exibido.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS income_entries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      description TEXT    NOT NULL,
      amount      REAL    NOT NULL,
      date        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_income_entries_user_date ON income_entries(user_id, date)'
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS fixed_expenses (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      name       TEXT    NOT NULL,
      category   TEXT    NOT NULL DEFAULT '',
      amount     REAL    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS expense_entries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      description TEXT    NOT NULL,
      category    TEXT    NOT NULL DEFAULT '',
      amount      REAL    NOT NULL,
      date        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_expense_entries_user_date ON expense_entries(user_id, date)'
  );

  // T-035: template de despesa variável que se repete todo mês. Só o template
  // vive aqui; as ocorrências são `expense_entries` normais (editáveis/
  // excluíveis individualmente) materializadas sob demanda — ver
  // services/recurringExpenses.ts.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id),
      description  TEXT    NOT NULL,
      category     TEXT    NOT NULL DEFAULT '',
      amount       REAL    NOT NULL,
      day_of_month INTEGER NOT NULL CHECK(day_of_month BETWEEN 1 AND 31),
      start_month  TEXT    NOT NULL,
      active       INTEGER NOT NULL DEFAULT 1,
      ended_at     TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user_active
     ON recurring_expenses(user_id, active)`
  );

  // Livro-razão de "meses já gerados" de cada recorrência (T-035). É ele — e não
  // a existência da ocorrência em expense_entries — que torna a materialização
  // idempotente: a linha SOBREVIVE ao delete da ocorrência, então excluir um
  // lançamento gerado não o recria no próximo GET do mês.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS recurring_expense_months (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      recurring_id INTEGER NOT NULL REFERENCES recurring_expenses(id),
      month        TEXT    NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // A chave única por (recorrência × mês) é o que segura a corrida de dois GETs
  // simultâneos do mesmo mês: o INSERT OR IGNORE de um deles afeta 0 linhas e
  // só o vencedor insere a ocorrência.
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_expense_months_unique
     ON recurring_expense_months(recurring_id, month)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS savings_entries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      type       TEXT    NOT NULL CHECK(type IN ('DEPOSIT', 'WITHDRAW', 'YIELD')),
      amount     REAL    NOT NULL,
      date       TEXT    NOT NULL,
      note       TEXT    NOT NULL DEFAULT '',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS category_budgets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      category   TEXT    NOT NULL,
      amount     REAL    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Expression-based unique constraint: um orçamento por categoria por usuário
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_category_budgets_user_category
     ON category_budgets(user_id, category)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS goals (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id),
      name           TEXT    NOT NULL,
      target_amount  REAL    NOT NULL,
      current_amount REAL    NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Billing / assinatura Pix (T-069) ──────────────────────────────────────
  //
  // ATENÇÃO — este é o ÚNICO layer do banco em que dinheiro é guardado em
  // CENTAVOS (INTEGER), e não em REAL como o resto do app (`amount`, `price`,
  // `target_amount`…). O motivo é externo: a API da AbacatePay transaciona
  // valores inteiros em centavos, e arredondar de/para REAL a cada cobrança
  // abriria espaço para divergência de 1 centavo entre o que o app registra e
  // o que o PSP cobrou. Em cobrança isso é reconciliação quebrada, então aqui
  // a representação segue a do provedor. Converter para reais é
  // responsabilidade da camada de apresentação.

  await db.execute(`
    CREATE TABLE IF NOT EXISTS plans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL,
      interval    TEXT    NOT NULL CHECK(interval IN ('monthly', 'yearly')),
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // `code` é a chave estável do plano (o id numérico é detalhe de storage):
  // é por ele que o seed é idempotente e que o front referencia o plano.
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_code ON plans(code)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id            INTEGER NOT NULL REFERENCES users(id),
      plan_id            INTEGER NOT NULL REFERENCES plans(id),
      status             TEXT    NOT NULL DEFAULT 'pending'
                                 CHECK(status IN ('pending', 'active', 'expired', 'canceled')),
      current_period_end TEXT,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // UMA assinatura por usuário — mesma decisão da carteira única (T-050).
  // Trocar de plano é UPDATE da linha existente (plan_id/status), nunca uma
  // segunda linha; sem isso "qual é o plano do usuário?" deixa de ter resposta
  // única e a leitura precisaria de regra de desempate.
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pix_charges (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id),
      plan_id           INTEGER NOT NULL REFERENCES plans(id),
      abacate_charge_id TEXT    NOT NULL,
      amount_cents      INTEGER NOT NULL,
      status            TEXT    NOT NULL DEFAULT 'PENDING'
                                CHECK(status IN ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED')),
      br_code           TEXT    NOT NULL DEFAULT '',
      br_code_base64    TEXT    NOT NULL DEFAULT '',
      expires_at        TEXT,
      paid_at           TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // O id da cobrança no provedor é único do nosso lado também: é a chave que o
  // webhook usa para achar a linha a atualizar, e duplicá-la tornaria o
  // processamento ambíguo.
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pix_charges_abacate_id
     ON pix_charges(abacate_charge_id)`
  );

  // Leitura típica: "a cobrança PENDING mais recente deste usuário".
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_pix_charges_user_status
     ON pix_charges(user_id, status, created_at)`
  );

  // Log de idempotência de webhook. Entra já nesta tarefa de propósito (schema
  // mora num arquivo só); quem passa a escrever nela é a T-070: o handler
  // insere o `event_id` e, se o UNIQUE recusar, o evento é reentrega e o
  // efeito colateral (ativar assinatura) NÃO é reaplicado.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS billing_webhook_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id    TEXT NOT NULL,
      event_type  TEXT NOT NULL DEFAULT '',
      charge_id   TEXT NOT NULL DEFAULT '',
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_webhook_events_event
     ON billing_webhook_events(event_id)`
  );

  // ── Open Finance / Pluggy (T-089a) ────────────────────────────────────────
  //
  // Uma linha por CONEXÃO do usuário com uma instituição financeira (o "item"
  // da Pluggy). Antes desta tabela o `itemId` vivia em `PLUGGY_ITEM_ID` no
  // `.env` do `cli` — ou seja, uma instalação, um usuário. Aqui ele passa a ser
  // dado por usuário, que é o que permite o botão de conexão no app.
  //
  // `status` é o último estado conhecido do item na Pluggy (`UPDATED`,
  // `LOGIN_ERROR`, `OUTDATED`…). É cache informativo, não invariante: a Pluggy é
  // a fonte da verdade e quem sincroniza pode encontrar qualquer estado.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pluggy_items (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id),
      item_id        TEXT    NOT NULL,
      connector_id   INTEGER,
      connector_name TEXT,
      status         TEXT    NOT NULL DEFAULT 'UNKNOWN',
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Unicidade GLOBAL de `item_id`, não `(user_id, item_id)`.
  //
  // O `itemId` é uma credencial portadora (quem o tem lê o extrato daquela
  // conexão), não um nome escolhido pelo usuário. Com unicidade por usuário, o
  // usuário B poderia registrar o `itemId` de A e passar a importar o extrato
  // bancário de A para dentro da própria conta — vazamento silencioso, sem
  // nenhuma violação de constraint para segurá-lo. Global torna esse caso um
  // erro de unicidade, que a camada de domínio traduz em erro tipado sem
  // revelar de quem é o item.
  //
  // O caso legítimo de "o mesmo item reaparece" é a RECONEXÃO do MESMO usuário:
  // aí o upsert por `item_id` atualiza conector/status da linha existente, e é
  // por isso que `linkPluggyItem` é idempotente sem SELECT prévio (TOCTOU).
  // Custo aceito: item que troca de dono só pode ser religado depois que o dono
  // antigo o remover.
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pluggy_items_item ON pluggy_items(item_id)`
  );

  // Leitura do job/rota: "os items deste usuário" (ordem estável por criação).
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_pluggy_items_user ON pluggy_items(user_id, created_at)`
  );

  // Add user_id column to existing tables (idempotent — ignored if already present)
  for (const sql of [
    'ALTER TABLE operations ADD COLUMN user_id INTEGER REFERENCES users(id)',
    'ALTER TABLE alert_rules ADD COLUMN user_id INTEGER REFERENCES users(id)',
    'ALTER TABLE operations ADD COLUMN wallet_id INTEGER REFERENCES wallets(id)',
    "ALTER TABLE users ADD COLUMN roles TEXT NOT NULL DEFAULT '[]'",
    // T-024: vínculo opcional entre lançamento de poupança e meta financeira.
    // Metas com lançamentos vinculados passam a ter progresso derivado.
    'ALTER TABLE savings_entries ADD COLUMN goal_id INTEGER REFERENCES goals(id)',
    // T-035: origem de uma ocorrência materializada de recorrência mensal.
    // NULL = lançamento digitado à mão. O template nunca é apagado (encerrar
    // é `active = 0`), então a FK nunca bloqueia um delete.
    'ALTER TABLE expense_entries ADD COLUMN recurring_id INTEGER REFERENCES recurring_expenses(id)',
    // T-041: etiqueta de procedência que amarra as duas pernas de uma
    // transferência poupança → meta (WITHDRAW sem vínculo + DEPOSIT vinculado,
    // mesmo uuid). É só rótulo para a UI: nada é validado entre as pernas e o
    // PATCH não aceita o campo — cada perna segue editável/excluível sozinha.
    'ALTER TABLE savings_entries ADD COLUMN transfer_group TEXT',
    // T-084: identificador da transação no sistema de ORIGEM (FITID do OFX,
    // id da transação Pluggy). NULL = lançamento criado à mão pela UI — é a
    // esmagadora maioria das linhas, por isso o índice de unicidade abaixo é
    // PARCIAL. Sem NOT NULL/DEFAULT: a coluna é nullable por design (e
    // `ALTER TABLE ADD COLUMN` no SQLite exigiria default para NOT NULL).
    'ALTER TABLE income_entries ADD COLUMN external_id TEXT',
    'ALTER TABLE expense_entries ADD COLUMN external_id TEXT',
    // T-092: perfil do usuário — nome de exibição e telefone, ambos opcionais
    // (nullable por design; sem DEFAULT porque ADD COLUMN NOT NULL exigiria um).
    'ALTER TABLE users ADD COLUMN name TEXT',
    'ALTER TABLE users ADD COLUMN phone TEXT',
  ]) {
    try {
      await db.execute(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_savings_entries_goal
     ON savings_entries(user_id, goal_id)`
  );

  // T-084 — dedupe de importação. Índice único PARCIAL: o
  // `WHERE external_id IS NOT NULL` não é só otimização — mantém o índice
  // restrito às linhas importadas (as manuais, maioria, ficam fora) e deixa a
  // intenção explícita, já que em SQLite NULLs nunca colidem num UNIQUE.
  // O par é (user_id, external_id): dois usuários podem importar o MESMO FITID
  // (mesmo extrato, contas diferentes) sem conflito.
  //
  // Ordem importa: estes CREATE INDEX vêm DEPOIS do loop de ALTER acima —
  // criá-los antes falharia com `no such column` no primeiro boot.
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_income_entries_user_external
     ON income_entries(user_id, external_id) WHERE external_id IS NOT NULL`
  );
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_entries_user_external
     ON expense_entries(user_id, external_id) WHERE external_id IS NOT NULL`
  );

  // Sessões do express-session (T-034): persistidas no mesmo banco em vez do
  // MemoryStore, para sobreviver a restart do server. Ver SqliteSessionStore
  // em auth/sessionStore.ts para a lógica de TTL/expiração.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid        TEXT    PRIMARY KEY,
      data       TEXT    NOT NULL,
      expires_at TEXT    NOT NULL
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`);

  // Varredura de limpeza no boot: remove sessões expiradas de execuções
  // anteriores que nunca mais serão lidas (o lazy-delete do Store só limpa o
  // que é efetivamente consultado em `get`). Lógica extraída para
  // `cleanupExpiredSessions` (db/sessionStore.ts) para ser testada
  // diretamente (T-046), sem precisar iniciar o server inteiro.
  await cleanupExpiredSessions(db);

  await normalizeExistingCategories();
  await seedPlans();
}
