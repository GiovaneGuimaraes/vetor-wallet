import { ProductArchivedError } from 'src/ProductArchivedError';

describe('ProductArchivedError', () => {
  test('carrega produto e chave, com nome próprio para a rota mapear', () => {
    const err = new ProductArchivedError('prod_arq', 'pro_monthly:1990');

    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      name: 'ProductArchivedError',
      message: 'Produto prod_arq (pro_monthly:1990) está arquivado na AbacatePay',
      productId: 'prod_arq',
      externalId: 'pro_monthly:1990',
    });
  });
});
