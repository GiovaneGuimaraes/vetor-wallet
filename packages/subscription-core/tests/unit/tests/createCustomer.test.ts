import { AbacatePayError } from 'src/providers/abacatepay/AbacatePayError';
import { createCustomer } from 'src/providers/abacatepay/createCustomer';
import { errorEnvelope, mockFetch, okEnvelope, sentRequest } from 'tests/unit/mockFetch';

describe('createCustomer', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(okEnvelope({ id: 'cust_abc', email: 'ana@example.com' }));
  });

  test('POST /customers/create só com e-mail e nome — sem CPF nem celular', async () => {
    await createCustomer({ email: 'ana@example.com', name: 'Ana Teste' });

    expect(sentRequest(fetchMock)).toMatchSnapshot();
  });

  test('nome ausente é OMITIDO do JSON, não mandado como null', async () => {
    await createCustomer({ email: 'ana@example.com' });

    expect(sentRequest(fetchMock).body).toEqual({ email: 'ana@example.com' });
  });

  test('devolve só o id', async () => {
    await expect(createCustomer({ email: 'ana@example.com' })).resolves.toEqual({
      id: 'cust_abc',
    });
  });

  test.each([[{}], [{ id: '' }], [{ id: 42 }]])(
    'resposta sem id utilizável (%j) é erro, não cliente vazio',
    async (data) => {
      fetchMock.mockResolvedValue(okEnvelope(data));

      await expect(createCustomer({ email: 'ana@example.com' })).rejects.toBeInstanceOf(
        AbacatePayError
      );
    }
  );

  test('propaga a recusa do provedor', async () => {
    fetchMock.mockResolvedValue(errorEnvelope('Invalid email'));

    await expect(createCustomer({ email: 'x' })).rejects.toMatchObject({ status: 400 });
  });
});
