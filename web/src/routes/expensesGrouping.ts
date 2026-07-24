import type { FixedExpense } from '@vetor-wallet/shared';

const SEM_CATEGORIA = 'Sem categoria';

export interface CategoryGroup {
  category: string;
  items: FixedExpense[];
  total: number;
}

/**
 * Agrupa despesas fixas por categoria (usando "Sem categoria" quando vazia),
 * calcula o total por grupo e ordena os grupos alfabeticamente (pt-BR).
 * Função pura usada pela `DespesasPage` (T-009).
 */
export function groupByCategory(items: FixedExpense[]): CategoryGroup[] {
  const map = new Map<string, FixedExpense[]>();
  for (const item of items) {
    const key = item.category.trim() || SEM_CATEGORIA;
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return Array.from(map.entries())
    .map(([category, groupItems]) => ({
      category,
      items: groupItems,
      total: groupItems.reduce((acc, i) => acc + i.amount, 0),
    }))
    .sort((a, b) => a.category.localeCompare(b.category, 'pt-BR'));
}
