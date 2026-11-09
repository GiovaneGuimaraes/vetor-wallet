import { deleteSubscriptionCheckout } from 'src/providers/abacatepay/deleteSubscriptionCheckout';
import { errorEnvelope, mockFetch, okEnvelope, rawResponse, sentRequest } from 'tests/unit/mockFetch';

describe('deleteSubscriptionCheckout', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(okEnvelope({ id: 'bill_abc' }));
  });

  test('POST /subscriptions/checkouts/delete com o id na query, sem corpo', async () => {
    await deleteSubscriptionCheckout('bill_a b');

    expect(sentRequest(fetchMock)).toEqual({
      url: 'https://api.abacatepay.com/v2/subscriptions/checkouts/delete?id=bill_a%20b',
      method: 'POST',
      body: undefined,
    });
  });

  test('resolve sem valor no sucesso', async () => {
    await expect(deleteSubscriptionCheckout('bill_abc')).resolves.toBeUndefined();
  });

  test('sucesso sem data (envelope 200 com data nula) é sucesso', async () => {
    fetchMock.mockResolvedValue(rawResponse({ data: null, error: null, success: true }));

    await expect(deleteSubscriptionCheckout('bill_abc')).resolves.toBeUndefined();
  });

  test('recusa sobe', async () => {
    fetchMock.mockResolvedValue(errorEnvelope('Checkout not found'));

    await expect(deleteSubscriptionCheckout('bill_x')).rejects.toMatchObject({
      name: 'AbacatePayError',
      status: 400,
    });
  });
});
