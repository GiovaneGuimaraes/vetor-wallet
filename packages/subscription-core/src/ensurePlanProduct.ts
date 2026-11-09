import type { Query } from '@vetor-wallet/query';

import type { PlanRow } from './Plan';
import { ProductArchivedError } from './ProductArchivedError';
import { ProductPriceMismatchError } from './ProductPriceMismatchError';
import { abacatePayErrorText } from './providers/abacatepay/abacatePayErrorText';
import { AbacatePayError } from './providers/abacatepay/AbacatePayError';
import type { AbacateProduct } from './providers/abacatepay/AbacateProduct';
import { createProduct } from './providers/abacatepay/createProduct';
import { getProductByExternalId } from './providers/abacatepay/getProductByExternalId';
import { toAbacateCycle } from './providers/abacatepay/toAbacateCycle';

/** Linha de `plans` com as colunas do cartão (T-124a; NULL = produto ainda não criado). */
export type CardPlanRow = PlanRow & {
  abacate_product_id?: string | null;
  abacate_product_price_cents?: number | null;
};

/**
 * Chave do produto no provedor: código do plano + PREÇO em centavos.
 *
 * Decisão da T-124b1 (plano §G, "preço do plano mudado: produto novo,
 * assinaturas antigas ficam no antigo"): a AbacatePay não edita preço de
 * produto e recusa `externalId` repetido. Com a chave sendo só `plan.code`, um
 * preço novo não teria como nascer — `getProductByExternalId(code)` devolveria
 * o produto do preço VELHO e o checkout cobraria o valor antigo. Com o preço na
 * chave, cada preço tem o seu produto, a busca por `externalId` só acha produto
 * do preço certo, e as assinaturas antigas continuam no produto delas.
 */
const productExternalId = (plan: Pick<PlanRow, 'code' | 'price_cents'>): string => {
  return `${plan.code}:${Number(plan.price_cents)}`;
};

const isAlreadyExists = (err: unknown): boolean => {
  return (
    err instanceof AbacatePayError &&
    err.status === 400 &&
    /already\s+exists/i.test(abacatePayErrorText(err.body))
  );
};

/** Arquivado/inativo no provedor (o "delete" de produto só arquiva). */
const ARCHIVED_STATUSES = new Set(['ARCHIVED', 'INACTIVE']);

/**
 * Nunca usa um produto que não pode cobrar: arquivado → `ProductArchivedError`;
 * preço declarado diferente do plano → `ProductPriceMismatchError`. Os dois
 * são erro de configuração (a rota responde 502, não 500).
 */
const assertUsable = (product: AbacateProduct, priceCents: number, externalId: string): void => {
  if (product.status !== null && ARCHIVED_STATUSES.has(product.status.toUpperCase())) {
    throw new ProductArchivedError(product.id, externalId);
  }
  if (product.price !== null && product.price !== priceCents) {
    throw new ProductPriceMismatchError(product.id, product.price, priceCents);
  }
};

/**
 * O produto recorrente da AbacatePay que cobra este plano no cartão, criando
 * se for preciso.
 *
 * 1. `plans.abacate_product_id` gravado E `abacate_product_price_cents` igual a
 *    `price_cents` → devolve sem chamar o provedor.
 * 2. Senão busca por `externalId` (`productExternalId`); não achou → cria.
 * 3. `createProduct` com 400 "already exists" é corrida perdida (outro
 *    processo criou entre a busca e a criação) → relê por `externalId`.
 * 4. Grava com UPDATE condicional a `price_cents` ainda ser o preço com que o
 *    produto foi criado — um chamador com o plano lido antes de uma troca de
 *    preço não grava o produto do preço velho por cima.
 *
 * Erro do provedor sobe (`AbacatePayError`). Produto arquivado ou com preço
 * divergente → `ProductArchivedError`/`ProductPriceMismatchError` (nada é
 * gravado; não reativa nem recria com a mesma chave, que a API recusaria).
 * O caminho rápido (1) não consulta o provedor, então não percebe um produto
 * arquivado DEPOIS de gravado — o checkout falha no provedor e a rota dá 502.
 */
export const ensurePlanProduct = async (args: {
  query: Query;
  plan: CardPlanRow;
}): Promise<{ productId: string; created: boolean }> => {
  const { plan } = args;
  const priceCents = Number(plan.price_cents);

  if (plan.abacate_product_id && Number(plan.abacate_product_price_cents) === priceCents) {
    return { productId: plan.abacate_product_id, created: false };
  }

  const externalId = productExternalId(plan);
  let product = await getProductByExternalId(externalId);
  let created = false;

  if (!product) {
    try {
      product = await createProduct({
        externalId,
        name: `Vetor Wallet — ${plan.name}`,
        priceCents,
        cycle: toAbacateCycle(plan.interval),
      });
      created = true;
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
      product = await getProductByExternalId(externalId);
      if (!product) throw err;
    }
  }

  assertUsable(product, priceCents, externalId);

  await args.query({
    text: `UPDATE plans SET abacate_product_id = $1, abacate_product_price_cents = $2
          WHERE id = $3 AND price_cents = $4`,
    values: [product.id, priceCents, plan.id, priceCents],
  });

  return { productId: product.id, created };
};
