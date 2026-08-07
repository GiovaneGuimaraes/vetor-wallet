import { db } from './client';

// Cópia local de `normalizeCategory` (T-097 — extração de `packages/db`):
// antes desta extração, este arquivo importava a função de
// `server/src/api/services/categories.ts` (acoplamento consciente, documentado
// na T-028). Um package `db` isolado não pode depender de volta em `server`
// (ciclo de dependência), então esta é agora a TERCEIRA cópia da mesma função
// de 1 linha — mesmo padrão já usado entre server e web (ver
// `web/src/routes/categories.ts` e `server/src/api/services/categories.ts`,
// que documentam por que a função não pode viver em `shared/`, que é
// types-only). As três cópias devem mudar juntas.
function normalizeCategory(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
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
    'SELECT id, user_id, category FROM category_budgets ORDER BY user_id ASC, id ASC',
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
