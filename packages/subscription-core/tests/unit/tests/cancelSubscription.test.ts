import { cancelSubscription } from 'src/providers/abacatepay/cancelSubscription';
import {
  errorEnvelope,
  mockFetch,
  okEnvelope,
  rawResponse,
  sentRequest,
} from 'tests/unit/mockFetch';

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

  test('sucesso sem data (200, data nula, sem error) é sucesso — o cancelamento aconteceu (T-124b1)', async () => {
    fetchMock.mockResolvedValue(rawResponse({ data: null, error: null, success: true }));

    await expect(cancelSubscription('subs_abc')).resolves.toBeUndefined();
  });

  test.each([
    ['success:false', { data: null, error: null, success: false }],
    ['error preenchido', { data: null, error: 'recusado' }],
  ])('200 com %s NÃO é sucesso', async (_l, body) => {
    fetchMock.mockResolvedValue(rawResponse(body));

    await expect(cancelSubscription('subs_abc')).rejects.toMatchObject({ status: 200 });
  });

  test('rede fora (status 0) sobe — não sabemos se cancelou', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(cancelSubscription('subs_abc')).rejects.toMatchObject({ status: 0 });
  });

  test('id inexistente (400 "Subscription not found") sobe', async () => {
    fetchMock.mockResolvedValue(errorEnvelope('Subscription not found'));

    await expect(cancelSubscription('subs_nope')).rejects.toMatchObject({
      name: 'AbacatePayError',
      status: 400,
    });
  });
});
