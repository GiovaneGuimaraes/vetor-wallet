import { AbacatePayError } from 'src/providers/abacatepay/AbacatePayError';
import { createSubscriptionCheckout } from 'src/providers/abacatepay/createSubscriptionCheckout';
import { errorEnvelope, mockFetch, okEnvelope, sentRequest } from 'tests/unit/mockFetch';

const input = {
  productId: 'prod_abc',
  customerId: 'cust_abc',
  externalId: 'checkout:17',
  completionUrl: 'http://localhost:5173/planos?checkout=17',
  returnUrl: 'http://localhost:5173/planos',
};

const checkout = { id: 'bill_abc', url: 'https://app.abacatepay.com/pay/bill_abc' };

describe('createSubscriptionCheckout', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(okEnvelope({ ...checkout, status: 'PENDING' }));
  });

  test('POST /subscriptions/create: um item do produto, só CARD, URLs de volta', async () => {
    await createSubscriptionCheckout(input);

    expect(sentRequest(fetchMock)).toMatchSnapshot();
  });

  test('devolve só o id do checkout (bill_) e a url hospedada', async () => {
    await expect(createSubscriptionCheckout(input)).resolves.toEqual(checkout);
  });

  test.each([
    [{ url: checkout.url }],
    [{ id: '', url: checkout.url }],
    [{ id: checkout.id }],
    [{ id: checkout.id, url: '' }],
    [{ id: 1, url: 2 }],
  ])('checkout incompleto (%j) é erro', async (data) => {
    fetchMock.mockResolvedValue(okEnvelope(data));

    await expect(createSubscriptionCheckout(input)).rejects.toBeInstanceOf(AbacatePayError);
  });

  test('propaga a recusa do provedor', async () => {
    fetchMock.mockResolvedValue(errorEnvelope('Product not found'));

    await expect(createSubscriptionCheckout(input)).rejects.toMatchObject({ status: 400 });
  });
});
