import { type AbacateProduct, type RawAbacateProduct, toAbacateProduct } from './AbacateProduct';
import type { AbacateCycle } from './toAbacateCycle';
import { abacatePayRequest } from './request';

export interface CreateProductInput {
  /** Nossa chave do produto. Repetida, a API responde 400 "already exists". */
  externalId: string;
  /**
   * Vai como veio: o nome do produto aceita acento, travessão e 130+
   * caracteres (medido na API real). `sanitizeDescription` é da descrição da
   * cobrança Pix, não daqui.
   */
  name: string;
  /** CENTAVOS. */
  priceCents: number;
  cycle: AbacateCycle;
}

/**
 * Cria o produto recorrente que cobra um plano no cartão.
 *
 * `externalId` repetido é HTTP 400 → `AbacatePayError` — quem cria e perde uma
 * corrida recupera o produto por `getProductByExternalId`.
 */
export const createProduct = async (input: CreateProductInput): Promise<AbacateProduct> => {
  const raw = await abacatePayRequest<RawAbacateProduct>('/products/create', {
    method: 'POST',
    body: {
      externalId: input.externalId,
      name: input.name,
      price: input.priceCents,
      currency: 'BRL',
      cycle: input.cycle,
    },
  });

  return toAbacateProduct(raw);
};
