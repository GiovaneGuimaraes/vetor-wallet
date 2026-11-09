import { cancelSubscription } from 'src/providers/abacatepay/cancelSubscription';
import { errorEnvelope, mockFetch, okEnvelope, sentRequest } from 'tests/unit/mockFetch';

describe('cancelSubscription', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(okEnvelope({ id: 'subs_abc', status: 'CANCELLED' }));
  });

  test('POST /subscriptions/cancel com o id no CORPO', async () => {
    await cancelSubscription('subs_abc');

    expect(sentRequest(fetchMock)).toMatchSnapshot();
  });

  test('resolve sem valor no sucesso', async () => {
    await expect(cancelSubscription('subs_abc')).resolves.toBeUndefined();
  });

  test('id inexistente (400 "Subscription not found") sobe', async () => {
    fetchMock.mockResolvedValue(errorEnvelope('Subscription not found'));

    await expect(cancelSubscription('subs_nope')).rejects.toMatchObject({
      name: 'AbacatePayError',
      status: 400,
    });
  });
});
