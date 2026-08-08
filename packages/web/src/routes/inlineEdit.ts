/**
 * Helpers puros da edição inline dos layers básicos (T-031).
 *
 * As 4 telas editáveis (`/renda`, `/despesas` — fixas e lançamentos —, e
 * `/poupanca`) repetem o mesmo par de operações antes de disparar o PATCH:
 * converter o texto digitado num número válido e reduzir o rascunho ao
 * subconjunto de campos que realmente mudou. Ambas ficam aqui, fora dos
 * componentes, para poderem ser testadas (política de testes do CLAUDE.md).
 */

/**
 * Converte um valor monetário digitado em número, aceitando vírgula decimal
 * (pt-BR). Devolve `null` para qualquer entrada que o server rejeitaria com
 * 400 — vazia, não numérica, infinita ou ≤ 0 —, mesma regra dos forms de
 * criação já existentes.
 */
export function parseMoneyInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Campos do rascunho que diferem do registro original — exatamente o corpo que
 * o PATCH parcial deve receber.
 *
 * Um objeto vazio significa "nada mudou": o cliente deve fechar o modo de
 * edição sem chamar a API, já que um PATCH sem campos responderia 400.
 * A comparação é `!==` estrito, então os dois lados precisam usar a mesma
 * representação de cada campo (valores monetários como string, por exemplo).
 */
export function diffEditableFields<T extends Record<string, string | number | null>>(
  original: T,
  draft: T
): Partial<T> {
  const changed: Partial<T> = {};
  for (const key of Object.keys(draft) as (keyof T)[]) {
    if (draft[key] !== original[key]) changed[key] = draft[key];
  }
  return changed;
}

/** `true` quando `diffEditableFields` encontrou ao menos um campo alterado. */
export function hasEdits(diff: object): boolean {
  return Object.keys(diff).length > 0;
}
