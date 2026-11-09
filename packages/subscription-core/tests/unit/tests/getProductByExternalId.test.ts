import { getProductByExternalId } from 'src/providers/abacatepay/getProductByExternalId';
import {
  errorEnvelope,
  mockFetch,
  okEnvelope,
  rawResponse,
  sentRequest,
} from 'tests/unit/mockFetch';

describe('getProductByExternalId', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(okEnvelope({ id: 'prod_abc', externalId: 'plan:1' }));
  });

  test('GET /products/get com o externalId escapado na query', async () => {
    await getProductByExternalId('plan:pro monthly&x=1');

    expect(sentRequest(fetchMock)).toMatchSnapshot();
  });

  test('devolve o produto quando existe', async () => {
    await expect(getProductByExternalId('plan:1')).resolves.toMatchObject({
      id: 'prod_abc',
      externalId: 'plan:1',
    });
  });

  describe('"não existe" vira null', () => {
    test.each([
      ['404 sem corpo útil', rawResponse({}, 404)],
      ['400 com error string', errorEnvelope('Product not found')],
      ['400 com error { message }', errorEnvelope({ message: 'product NOT FOUND' })],
      ['400 em português', errorEnvelope('Produto não encontrado')],
      ['200 com data null e sem error', rawResponse({ data: null, error: null }, 200)],
    ])('%s', async (_, response) => {
      fetchMock.mockResolvedValue(response);

      await expect(getProductByExternalId('plan:1')).resolves.toBeNull();
    });
  });

  describe('erro real NÃO vira null — relança', () => {
    test.each([
      ['400 de outra recusa', errorEnvelope('Invalid externalId')],
      ['400 com error { message } não-string', errorEnvelope({ message: 42 })],
      ['400 com error numérico', errorEnvelope(500)],
      ['400 sem corpo JSON', rawResponse(null, 400)],
      ['400 com corpo texto', rawResponse('Not found', 400)],
      ['200 sem corpo', rawResponse(null, 200)],
      ['200 com data E error', rawResponse({ data: {}, error: 'Unauthorized' }, 200)],
      ['401 dizendo not found', errorEnvelope('Key not found', 401)],
      ['500', errorEnvelope('Product not found', 500)],
      ['200 com error preenchido', rawResponse({ data: null, error: 'Unauthorized' }, 200)],
    ])('%s', async (_, response) => {
      fetchMock.mockResolvedValue(response);

      await expect(getProductByExternalId('plan:1')).rejects.toMatchObject({
        name: 'AbacatePayError',
      });
    });

    test('rede/timeout (status 0) relança — não é "não existe"', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));

      await expect(getProductByExternalId('plan:1')).rejects.toMatchObject({ status: 0 });
    });

    test('erro que não é AbacatePayError relança intacto', async () => {
      // Resposta sem `ok`/`status`: o acesso a `res.ok` explode como TypeError
      // fora do try do `abacatePayRequest`.
      fetchMock.mockResolvedValue(undefined);

      await expect(getProductByExternalId('plan:1')).rejects.toBeInstanceOf(TypeError);
    });

    test('produto sem id relança', async () => {
      fetchMock.mockResolvedValue(okEnvelope({ externalId: 'plan:1' }));

      await expect(getProductByExternalId('plan:1')).rejects.toThrow('sem id');
    });
  });
});
