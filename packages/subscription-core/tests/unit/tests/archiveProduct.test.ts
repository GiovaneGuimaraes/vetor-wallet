import { archiveProduct } from 'src/providers/abacatepay/archiveProduct';
import { errorEnvelope, mockFetch, okEnvelope, sentRequest } from 'tests/unit/mockFetch';

describe('archiveProduct', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(okEnvelope({ id: 'prod_abc', status: 'ARCHIVED' }));
  });

  test('POST /products/delete com o id escapado na query e sem corpo', async () => {
    await archiveProduct('prod_a b&c');

    expect(sentRequest(fetchMock)).toMatchSnapshot();
  });

  test('resolve sem valor no sucesso', async () => {
    await expect(archiveProduct('prod_abc')).resolves.toBeUndefined();
  });

  test('propaga a recusa do provedor', async () => {
    fetchMock.mockResolvedValue(errorEnvelope('Product not found'));

    await expect(archiveProduct('prod_nope')).rejects.toMatchObject({ status: 400 });
  });
});
