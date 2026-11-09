import { createProduct } from 'src/providers/abacatepay/createProduct';
import { errorEnvelope, mockFetch, okEnvelope, sentRequest } from 'tests/unit/mockFetch';

const input = {
  externalId: 'plan:pro_monthly:2990',
  name: 'Vetor Wallet — Pro Mensal (acentuação e travessão passam)',
  priceCents: 2990,
  cycle: 'MONTHLY' as const,
};

describe('createProduct', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(
      okEnvelope({ id: 'prod_abc', externalId: input.externalId, price: 2990, cycle: 'MONTHLY' })
    );
  });

  test('POST /products/create com preço em centavos, BRL e ciclo', async () => {
    await createProduct(input);

    expect(sentRequest(fetchMock)).toMatchSnapshot();
  });

  test('o nome vai INTACTO — sem sanitizeDescription (travessão é aceito aqui)', async () => {
    await createProduct(input);

    expect(sentRequest(fetchMock).body.name).toBe(input.name);
  });

  test('devolve o produto normalizado', async () => {
    await expect(createProduct(input)).resolves.toMatchObject({
      id: 'prod_abc',
      externalId: input.externalId,
      price: 2990,
      cycle: 'MONTHLY',
    });
  });

  test('externalId repetido (400 "already exists") sobe como AbacatePayError', async () => {
    fetchMock.mockResolvedValue(errorEnvelope('Product with externalId already exists'));

    await expect(createProduct(input)).rejects.toMatchObject({
      name: 'AbacatePayError',
      status: 400,
    });
  });
});
