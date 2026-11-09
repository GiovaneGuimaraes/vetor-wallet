/**
 * O produto achado na AbacatePay pela nossa chave (`<code>:<price_cents>`)
 * declara um preço diferente do plano. Nunca se cobra com ele. É erro de
 * CONFIGURAÇÃO (alguém criou/editou o produto à mão), não do usuário: a rota
 * mapeia para 502/`BILLING_NOT_CONFIGURED`, nunca 500.
 */
export class ProductPriceMismatchError extends Error {
  readonly productId: string;
  readonly providerPriceCents: number;
  readonly planPriceCents: number;

  constructor(productId: string, providerPriceCents: number, planPriceCents: number) {
    super(
      `Produto ${productId} tem preço ${providerPriceCents} no provedor, plano cobra ${planPriceCents}`
    );
    this.name = 'ProductPriceMismatchError';
    this.productId = productId;
    this.providerPriceCents = providerPriceCents;
    this.planPriceCents = planPriceCents;
  }
}
