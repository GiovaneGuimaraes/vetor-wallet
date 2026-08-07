/**
 * Normalização canônica de categoria (T-028).
 *
 * As três telas que usam categoria como texto livre — despesas fixas
 * (`fixed_expenses.category`), lançamentos variáveis (`expense_entries.category`)
 * e orçamentos (`category_budgets.category`) — comparavam categoria por
 * igualdade exata e sensível a caixa: "Mercado", "mercado" e "mercado " eram
 * três categorias diferentes, então um orçamento de "Mercado" exibia 0% com
 * gastos lançados em "mercado".
 *
 * ## Forma canônica escolhida: a forma normalizada é a forma ARMAZENADA
 *
 * `normalizeCategory` devolve a única representação gravada no banco
 * (minúsculas, sem espaço nas pontas, espaços internos colapsados, unicode em
 * NFC). Consequências desejadas:
 *
 * - A comparação volta a ser `===` de string em **todos** os pontos (SQL e JS)
 *   sem que nenhum deles precise lembrar de normalizar — não há "chave
 *   normalizada" paralela ao valor exibido que possa divergir.
 * - O `UNIQUE(user_id, category)` de `category_budgets` passa a garantir
 *   unicidade lógica sozinho: o upsert de "Mercado" encontra o registro de
 *   "mercado" e substitui em vez de duplicar. Não foi preciso criar coluna de
 *   chave nem índice por expressão (`lower()`/`COLLATE NOCASE` do SQLite são
 *   ASCII-only e não dobrariam "SAÚDE"/"saúde" — `toLocaleLowerCase` dobra).
 *
 * Custo aceito: a caixa digitada pelo usuário não é preservada, então
 * acrônimos voltam capitalizados apenas na primeira letra na exibição
 * ("IPTU" → "Iptu", via `formatCategoryLabel` no web). Preservar a caixa
 * exigiria guardar valor de exibição + chave de comparação, com dois campos
 * que podem divergir e cinco pontos de comparação que precisariam lembrar de
 * usar a chave — troca ruim para um rótulo de categoria de despesa.
 *
 * ## Por que não em `shared/`
 *
 * `shared/` é **types-only** por construção (`emitDeclarationOnly: true`, sem
 * `main` no `package.json`; server e web só fazem `import type` dele, que é
 * apagado na compilação). Exportar uma função de runtime de lá quebraria o
 * `server/dist` (o `require('@vetor-wallet/shared')` emitido não resolveria
 * JS nenhum) e o bundle do web. Por isso a mesma normalização de 3 linhas vive
 * duplicada em `web/src/routes/categories.ts` — as duas cópias devem mudar
 * juntas, e ambas têm teste próprio.
 */
export function normalizeCategory(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}
