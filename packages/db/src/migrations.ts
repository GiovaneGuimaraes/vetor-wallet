import { db } from './client';
import { normalizeCategory } from '@vetor-wallet/validation-core';

// T-099a: `normalizeCategory` deixou de ser uma cópia local aqui — antes da
// extração de `@vetor-wallet/validation-core`, este arquivo tinha a TERCEIRA
// cópia da mesma função de 1 linha (server e web tinham as outras duas),
// porque um `db` isolado não podia importar de volta de `server` (ciclo).
// Agora `db` e `server` compartilham a mesma implementação via
// `validation-core` (que não depende de `db`, então não há ciclo). Só resta
// a cópia do `web` (`web/src/routes/categories.ts`) — o navegador não
// consome package de backend; essa cópia muda junto com a de
// `validation-core` (ver `packages/validation-core/CLAUDE.md`).

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
export async function normalizeExistingCategories() {
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
    'SELECT id, user_id, category FROM category_budgets ORDER BY user_id ASC, id ASC'
  );

  // Agrupa por (user_id, categoria canônica) mantendo os ids em ordem crescente.
  const groups = new Map<string, { userId: number; normalized: string; ids: number[] }>();
  for (const row of budgets.rows) {
    const id = Number(row.id);
    const userId = Number(row.user_id);
    const normalized = normalizeCategory(String(row.category ?? ''));
    const key = `${userId} ${normalized}`;
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

/**
 * Catálogo de planos do app (T-069). `price_cents` em CENTAVOS — ver o comentário
 * do bloco de billing em `schema.ts` para o porquê da divergência de unidade.
 */
export const DEFAULT_PLANS = [
  {
    code: 'pro_monthly',
    name: 'Pro Mensal',
    description: 'Acesso completo ao Vetor Wallet, cobrado mês a mês.',
    price_cents: 990,
    interval: 'monthly',
  },
  {
    code: 'pro_yearly',
    name: 'Pro Anual',
    description: 'Acesso completo ao Vetor Wallet por 12 meses, com desconto.',
    price_cents: 9900,
    interval: 'yearly',
  },
] as const;

/**
 * Semeia os planos padrão (T-069). Roda a cada `initDb()` e é idempotente:
 * `INSERT OR IGNORE` contra o UNIQUE de `code` — na segunda execução nenhuma
 * linha é inserida e os ids permanecem estáveis.
 *
 * O seed **nunca atualiza** um plano já existente (preço, nome ou descrição).
 * É decisão de produto, não descuido: alterar `price_cents` de um plano vigente
 * mudaria o valor cobrado de quem já assinou aquele plano, sem trilha do preço
 * antigo. Reajuste de preço se faz criando um plano com novo `code` (ou por
 * migração explícita e deliberada), não editando esta constante.
 */
export async function seedPlans() {
  for (const plan of DEFAULT_PLANS) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO plans (code, name, description, price_cents, interval, active)
            VALUES (?, ?, ?, ?, ?, 1)`,
      args: [plan.code, plan.name, plan.description, plan.price_cents, plan.interval],
    });
  }
}

/**
 * Colunas de `savings_entries` DEPOIS da remoção de Metas (T-091b2). É a ordem
 * exata em que a tabela é reconstruída e o que `dropGoalsSchema` copia da tabela
 * antiga — `goal_id` fica de fora, e só ele.
 */
const SAVINGS_ENTRIES_COLUMNS = [
  'id',
  'user_id',
  'type',
  'amount',
  'date',
  'note',
  'created_at',
  'transfer_group',
] as const;

/**
 * Migração DESTRUTIVA de remoção de Metas — etapa 2 de 2 (T-091b2, 2026-08-18).
 *
 * A etapa 1 (T-091b1) tirou Metas da UI e da API sem apagar uma linha, de
 * propósito: entre as duas etapas, desfazer era reverter código. Esta apaga o
 * dado, e depois dela não há desfazer — o humano autorizou em 2026-08-15, com
 * dump do `wallet.db` para fora do repo antes de rodar.
 *
 * O que sai, de vez:
 *
 * - a tabela `goals`;
 * - o índice `idx_savings_entries_goal`;
 * - a coluna `savings_entries.goal_id`.
 *
 * ## Por que é rebuild de tabela, e não `DROP COLUMN`
 *
 * `goal_id` nasceu como `ALTER TABLE savings_entries ADD COLUMN goal_id INTEGER
 * REFERENCES goals(id)`, ou seja, carrega uma FK para a tabela que está sendo
 * dropada. `ALTER TABLE ... DROP COLUMN` do SQLite recusa coluna envolvida em
 * constraint, então o caminho suportado é o rebuild clássico: criar a tabela nova
 * sem a coluna, copiar, dropar a antiga, renomear. `DROP TABLE goals` só é seguro
 * DEPOIS disso — enquanto a FK existir, a referência fica pendurada.
 *
 * ## Idempotência
 *
 * Não há tabela de versão de migração neste projeto: `initDb()` roda inteiro a
 * cada boot e cada passo é idempotente por construção. Aqui o detector é
 * `PRAGMA table_info(savings_entries)` — sem `goal_id` na lista, o rebuild é
 * pulado; os dois DROPs finais usam `IF EXISTS` e podem rodar sempre. Rodar duas
 * vezes seguidas é inócuo, e num banco novo (criado já sem `goals`) nenhum passo
 * faz nada.
 *
 * O `ALTER TABLE ... ADD COLUMN goal_id` saiu de `schema.ts` **na mesma
 * mudança**, e isso é parte da migração, não limpeza: sozinho, o rebuild seria
 * desfeito pelo boot seguinte, que recriaria a coluna.
 *
 * ## `transfer_group` NÃO sai
 *
 * A etiqueta da T-041 sobreviveu à T-091b1 de propósito — ela sustenta o selo
 * `⇄` de par legado na lista de `/poupanca` — e é copiada para a tabela nova. Ela
 * é adicionada pelo mesmo loop de ALTER que criava `goal_id`, e esse loop roda
 * ANTES desta função em `initDb()`, então aqui a coluna sempre existe.
 *
 * ## Transação e `foreign_keys`
 *
 * O rebuild vai num `db.batch(..., 'write')`: os quatro passos são uma transação
 * só, porque uma `savings_entries` dropada sem a nova no lugar é perda total do
 * layer de poupança. `PRAGMA foreign_keys` é desligado antes e restaurado depois
 * (PRAGMA não tem efeito dentro de transação, daí ficar fora do batch): com ele
 * ligado, o `DROP TABLE savings_entries` poderia disparar ação de FK na janela em
 * que as duas tabelas coexistem. Hoje o client não liga esse PRAGMA (o default do
 * SQLite é OFF), então na prática é defesa contra ele ser ligado depois.
 *
 * O `id` é copiado explicitamente, então nenhuma linha muda de identidade; com
 * `AUTOINCREMENT`, o `sqlite_sequence` da tabela nova é reposicionado pelo próprio
 * INSERT e não há reuso de id.
 */
export async function dropGoalsSchema() {
  const columns = await db.execute('PRAGMA table_info(savings_entries)');
  const hasGoalId = columns.rows.some((row) => String(row.name) === 'goal_id');

  if (hasGoalId) {
    const pragma = await db.execute('PRAGMA foreign_keys');
    const foreignKeysWereOn = Number(pragma.rows[0]?.foreign_keys ?? 0) === 1;
    if (foreignKeysWereOn) await db.execute('PRAGMA foreign_keys = OFF');

    const columnList = SAVINGS_ENTRIES_COLUMNS.join(', ');
    try {
      await db.batch(
        [
          `CREATE TABLE savings_entries_t091b2 (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id        INTEGER NOT NULL REFERENCES users(id),
            type           TEXT    NOT NULL CHECK(type IN ('DEPOSIT', 'WITHDRAW', 'YIELD')),
            amount         REAL    NOT NULL,
            date           TEXT    NOT NULL,
            note           TEXT    NOT NULL DEFAULT '',
            created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
            transfer_group TEXT
          )`,
          `INSERT INTO savings_entries_t091b2 (${columnList})
           SELECT ${columnList} FROM savings_entries`,
          'DROP TABLE savings_entries',
          'ALTER TABLE savings_entries_t091b2 RENAME TO savings_entries',
        ],
        'write'
      );
    } finally {
      if (foreignKeysWereOn) await db.execute('PRAGMA foreign_keys = ON');
    }
  }

  // O DROP da tabela antiga já levou o índice com ela; o `IF EXISTS` cobre o
  // banco que tinha o índice sem a coluna (ou vice-versa) e o segundo boot.
  await db.execute('DROP INDEX IF EXISTS idx_savings_entries_goal');
  await db.execute('DROP TABLE IF EXISTS goals');
}
