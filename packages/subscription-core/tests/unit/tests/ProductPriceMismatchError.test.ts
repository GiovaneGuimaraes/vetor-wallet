import { ProductPriceMismatchError } from 'src/ProductPriceMismatchError';

describe('ProductPriceMismatchError', () => {
  test('carrega produto e os dois preços, com nome próprio para a rota mapear', () => {
    const err = new ProductPriceMismatchError('prod_x', 999, 1990);

    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      name: 'ProductPriceMismatchError',
      message: 'Produto prod_x tem preço 999 no provedor, plano cobra 1990',
      productId: 'prod_x',
      providerPriceCents: 999,
      planPriceCents: 1990,
    });
  });
});
