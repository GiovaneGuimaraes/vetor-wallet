/**
 * Normalização canônica de categoria no client (T-028).
 *
 * Espelho de `server/src/services/categories.ts` — a decisão de projeto e o
 * porquê da forma canônica estão documentados lá. Resumo: a forma normalizada
 * (minúsculas, trim, espaços internos colapsados, NFC) é a forma **armazenada**
 * no banco, então o server já devolve tudo normalizado.
 *
 * A duplicação existe porque `shared/` é types-only (`emitDeclarationOnly`),
 * logo não pode exportar função de runtime sem mudar o contrato de build dos
 * três pacotes. As duas cópias devem mudar juntas.
 *
 * O client ainda normaliza por dois motivos:
 * 1. defesa contra dados legados exibidos antes de a migração do `initDb()`
 *    ter rodado naquele banco;
 * 2. estado otimista da `DespesasPage` — itens recém-criados entram na lista
 *    a partir da resposta do server (já normalizados), mas o agrupamento não
 *    deve depender disso para agrupar certo.
 */
export function normalizeCategory(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

/**
 * Rótulo de exibição de uma categoria normalizada: primeira letra em maiúscula,
 * resto como está ("mercado" → "Mercado", "compras do mês" → "Compras do mês").
 * Só a primeira letra — capitalizar cada palavra viraria "Compras Do Mês".
 * Categoria vazia devolve string vazia (quem exibe decide o fallback).
 */
export function formatCategoryLabel(category: string): string {
  const normalized = normalizeCategory(category);
  if (!normalized) return '';
  return normalized.charAt(0).toLocaleUpperCase('pt-BR') + normalized.slice(1);
}
