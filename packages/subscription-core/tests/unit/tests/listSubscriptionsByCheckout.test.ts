import { AbacatePayError } from 'src/providers/abacatepay/AbacatePayError';
import { listSubscriptionsByCheckout } from 'src/providers/abacatepay/listSubscriptionsByCheckout';
import { errorEnvelope, mockFetch, okEnvelope, sentRequest } from 'tests/unit/mockFetch';

describe('listSubscriptionsByCheckout', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(okEnvelope([]));
  });

  test('GET /subscriptions/list com o checkoutId escapado na query', async () => {
    await listSubscriptionsByCheckout('bill_a b&c');

    expect(sentRequest(fetchMock)).toMatchSnapshot();
  });

  test('antes do pagamento: data [] é resultado VÁLIDO (lista vazia, não erro)', async () => {
    await expect(listSubscriptionsByCheckout('bill_abc')).resolves.toEqual([]);
  });

  test('depois do pagamento: normaliza cada assinatura', async () => {
    fetchMock.mockResolvedValue(
      okEnvelope([
        { id: 'subs_1', status: 'ACTIVE', checkoutId: 'bill_abc' },
        { id: 'subs_2', status: 'CANCELED' },
      ])
    );

    const result = await listSubscriptionsByCheckout('bill_abc');

    expect(result.map((s) => [s.id, s.status])).toEqual([
      ['subs_1', 'ACTIVE'],
      ['subs_2', 'CANCELLED'],
    ]);
  });

  test.each([[{ id: 'subs_1' }], ['subs_1'], [0]])(
    'data que não é lista (%j) é erro',
    async (data) => {
      fetchMock.mockResolvedValue(okEnvelope(data));

      await expect(listSubscriptionsByCheckout('bill_abc')).rejects.toBeInstanceOf(AbacatePayError);
    }
  );

  test('propaga a recusa do provedor', async () => {
    fetchMock.mockResolvedValue(errorEnvelope('Checkout not found'));

    await expect(listSubscriptionsByCheckout('bill_nope')).rejects.toMatchObject({
      status: 400,
    });
  });
});
