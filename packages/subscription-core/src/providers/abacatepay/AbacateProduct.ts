import { AbacatePayError } from './AbacatePayError';

/** Produto recorrente normalizado. Campos que o provedor não mandou viram `null`. */
export interface AbacateProduct {
  id: string;
  externalId: string | null;
  name: string | null;
  /** CENTAVOS. */
  price: number | null;
  currency: string | null;
  cycle: string | null;
  /**
   * Status cru (ex.: `ACTIVE`, `ARCHIVED`). NÃO medido na API real — o
   * "delete" de produto arquiva, e é por aqui que a regra (T-124b1) recusa
   * cobrar com produto arquivado. Ausente → `null` (nada se conclui).
   */
  status: string | null;
}

/** Produto como o provedor devolve — nada garantido além do que se checa. */
export type RawAbacateProduct = Record<string, unknown>;

const str = (value: unknown): string | null => {
  return typeof value === 'string' ? value : null;
};

/**
 * Normaliza o produto. O `id` é o único campo obrigatório: sem ele não há o que
 * gravar em `plans.abacate_product_id`, então a ausência é erro do provedor
 * (lançado), não um produto vazio.
 */
export const toAbacateProduct = (raw: RawAbacateProduct): AbacateProduct => {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new AbacatePayError('AbacatePay devolveu produto sem id', 200, raw);
  }
  return {
    id: raw.id,
    externalId: str(raw.externalId),
    name: str(raw.name),
    price: typeof raw.price === 'number' && Number.isFinite(raw.price) ? raw.price : null,
    currency: str(raw.currency),
    cycle: str(raw.cycle),
    status: str(raw.status),
  };
};
