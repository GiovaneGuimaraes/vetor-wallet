import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';
import { normalizeCategory } from './services/categories';

// DATABASE_URL overrides the default local SQLite path.
// Use it when running from a different cwd (e.g. the cli package) or when
// migrating to Turso: DATABASE_URL=libsql://your-db.turso.io?authToken=...
const dbUrl = process.env.DATABASE_URL ?? (() => {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return `file:${path.join(dataDir, 'wallet.db')}`;
})();

export const db = createClient({ url: dbUrl });

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
    'write',
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
     ON quote_snapshots(ticker, date(captured_at))`,
  );

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_snapshots_ticker_time
     ON quote_snapshots(ticker, captured_at)`,
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
     ON hourly_quote_insights(ticker, quote_date, hour)`,
  );

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_hourly_insights_ticker_date
     ON hourly_quote_insights(ticker, quote_date)`,
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
    'CREATE INDEX IF NOT EXISTS idx_income_entries_user_date ON income_entries(user_id, date)',
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
    'CREATE INDEX IF NOT EXISTS idx_expense_entries_user_date ON expense_entries(user_id, date)',
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
     ON recurring_expenses(user_id, active)`,
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
     ON recurring_expense_months(recurring_id, month)`,
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
     ON category_budgets(user_id, category)`,
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
  ]) {
    try {
      await db.execute(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_savings_entries_goal
     ON savings_entries(user_id, goal_id)`,
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

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
  );

  // Varredura de limpeza no boot: remove sessões expiradas de execuções
  // anteriores que nunca mais serão lidas (o lazy-delete do Store só limpa o
  // que é efetivamente consultado em `get`). `expires_at` é gravado como ISO
  // string pelo SqliteSessionStore (auth/sessionStore.ts) — comparado aqui
  // via parâmetro (também ISO), nunca contra `datetime('now')` do SQLite:
  // os dois formatos têm separadores diferentes ('T' vs ' ') e comparar um
  // contra o outro quebraria a ordenação lexicográfica dentro do mesmo dia.
  await db.execute({
    sql: 'DELETE FROM sessions WHERE expires_at <= ?',
    args: [new Date().toISOString()],
  });

  await normalizeExistingCategories();
}

/**
 * Migração idempotente de dados (T-028): reescreve `category` das três tabelas
 * de texto livre na forma canônica (`normalizeCategory`), para que registros
 * gravados antes da normalização passem a comparar/agrupar junto com os novos.
 *
 * Roda a cada `initDb()`. Na segunda execução (e nas seguintes) toda categoria
 * já está normalizada, nenhum UPDATE/DELETE é emitido e o resultado é o mesmo —
 * a função é idempotente por construção, não por flag de "migração já rodou".
 *
 * `category_budgets` tem `UNIQUE(user_id, category)`, então a normalização pode
 * **colidir**: se o usuário tem "Mercado" e "mercado", os dois viram "mercado".
 * Regra de resolução, determinística e documentada: **vence o registro de maior
 * `id`** (o inserido mais recentemente, presumivelmente o teto que o usuário
 * ajustou por último) e os demais da mesma categoria canônica são **apagados**.
 * O desempate é por `id` — e não por `created_at` — porque `created_at` tem
 * resolução de segundos e empataria em inserções próximas.
 */
async function normalizeExistingCategories() {
  // Tabelas sem constraint de unicidade em category: basta reescrever o valor.
  // Percorre valores DISTINTOS (não linhas) — um UPDATE por valor a corrigir.
  for (const table of ['fixed_expenses', 'expense_entries'] as const) {
    const distinct = await db.execute(`SELECT DISTINCT category FROM ${table}`);
    for (const row of distinct.rows) {
      const raw = String(row.category ?? '');
      const normalized = normalizeCategory(raw);
      if (normalized === raw) continue;
      await db.execute({
        sql: `UPDATE ${table} SET category = ? WHERE category = ?`,
        args: [normalized, raw],
      });
    }
  }

  const budgets = await db.execute(
    'SELECT id, user_id, category FROM category_budgets ORDER BY user_id ASC, id ASC',
  );

  // Agrupa por (user_id, categoria canônica) mantendo os ids em ordem crescente.
  const groups = new Map<string, { userId: number; normalized: string; ids: number[] }>();
  for (const row of budgets.rows) {
    const id = Number(row.id);
    const userId = Number(row.user_id);
    const normalized = normalizeCategory(String(row.category ?? ''));
    const key = `${userId} ${normalized}`;
    const group = groups.get(key);
    if (group) {
      group.ids.push(id);
    } else {
      groups.set(key, { userId, normalized, ids: [id] });
    }
  }

  for (const group of groups.values()) {
    const winnerId = group.ids[group.ids.length - 1]; // maior id = mais recente
    const losers = group.ids.slice(0, -1);

    // Apaga os perdedores ANTES de atualizar o vencedor: na ordem inversa o
    // UPDATE colidiria com o UNIQUE(user_id, category) ainda ocupado.
    for (const loserId of losers) {
      await db.execute({
        sql: 'DELETE FROM category_budgets WHERE id = ?',
        args: [loserId],
      });
    }

    await db.execute({
      sql: 'UPDATE category_budgets SET category = ? WHERE id = ? AND category <> ?',
      args: [group.normalized, winnerId, group.normalized],
    });
  }
}
