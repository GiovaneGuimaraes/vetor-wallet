import { getSubscription } from 'src/providers/abacatepay/getSubscription';
import { errorEnvelope, mockFetch, okEnvelope, sentRequest } from 'tests/unit/mockFetch';

describe('getSubscription', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(
      okEnvelope({ id: 'subs_abc', status: 'ACTIVE', checkoutId: 'bill_abc' })
    );
  });

  test('GET /subscriptions/get com o id escapado na query', async () => {
    await getSubscription('subs_a b&c');

    expect(sentRequest(fetchMock)).toMatchSnapshot();
  });

  test('devolve a assinatura normalizada', async () => {
    await expect(getSubscription('subs_abc')).resolves.toMatchObject({
      id: 'subs_abc',
      status: 'ACTIVE',
      checkoutId: 'bill_abc',
      nextBillingAt: null,
    });
  });

  test('id inexistente (400 "Subscription not found") SOBE como AbacatePayError', async () => {
    fetchMock.mockResolvedValue(errorEnvelope('Subscription not found'));

    await expect(getSubscription('subs_nope')).rejects.toMatchObject({
      name: 'AbacatePayError',
      status: 400,
    });
  });
});
