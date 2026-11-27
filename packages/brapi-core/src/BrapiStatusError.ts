/**
 * Resposta não-ok da brapi, com o status para o chamador decidir (a rota de
 * histórico traduz 400/404 em "ticker sem histórico" e o resto em 502). A
 * mensagem nunca inclui a URL, que carrega o token.
 */
export class BrapiStatusError extends Error {
  constructor(
    readonly status: number,
    ticker: string
  ) {
    super(`brapi responded with ${status} for ${ticker}`);
    this.name = 'BrapiStatusError';
  }
}
