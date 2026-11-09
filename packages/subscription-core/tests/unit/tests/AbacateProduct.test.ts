import { AbacatePayError } from 'src/providers/abacatepay/AbacatePayError';
import { toAbacateProduct } from 'src/providers/abacatepay/AbacateProduct';

describe('toAbacateProduct', () => {
  test('normaliza o produto completo', () => {
    expect(
      toAbacateProduct({
        id: 'prod_abc',
        externalId: 'plan:pro_monthly:2990',
        name: 'Vetor Wallet — Pro Mensal',
        price: 2990,
        currency: 'BRL',
        cycle: 'MONTHLY',
        extra: 'ignorado',
      })
    ).toEqual({
      id: 'prod_abc',
      externalId: 'plan:pro_monthly:2990',
      name: 'Vetor Wallet — Pro Mensal',
      price: 2990,
      currency: 'BRL',
      cycle: 'MONTHLY',
    });
  });

  test('campos ausentes ou de tipo errado viram null', () => {
    expect(toAbacateProduct({ id: 'prod_abc', name: 7, price: '2990' })).toEqual({
      id: 'prod_abc',
      externalId: null,
      name: null,
      price: null,
      currency: null,
      cycle: null,
    });
  });

  test('preço não finito vira null', () => {
    expect(toAbacateProduct({ id: 'prod_abc', price: Number.NaN }).price).toBeNull();
  });

  test.each([[{}], [{ id: '' }], [{ id: 1 }]])('sem id (%j) é erro do provedor', (raw) => {
    expect(() => toAbacateProduct(raw)).toThrow(AbacatePayError);
  });
});
