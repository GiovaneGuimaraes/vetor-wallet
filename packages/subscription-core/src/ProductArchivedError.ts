/**
 * O produto da nossa chave (`<code>:<price_cents>`) existe na AbacatePay mas
 * está ARQUIVADO/INATIVO (o "delete" de produto só arquiva). Não reativamos nem
 * recriamos com a mesma chave — a API recusa `externalId` repetido. Resolver é
 * decisão humana (desarquivar no painel, ou mudar o preço/código do plano, o
 * que gera chave nova). A rota mapeia para 502/`BILLING_NOT_CONFIGURED`.
 */
export class ProductArchivedError extends Error {
  readonly productId: string;
  readonly externalId: string;

  constructor(productId: string, externalId: string) {
    super(`Produto ${productId} (${externalId}) está arquivado na AbacatePay`);
    this.name = 'ProductArchivedError';
    this.productId = productId;
    this.externalId = externalId;
  }
}
