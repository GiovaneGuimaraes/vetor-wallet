import { AbacatePayError } from 'src/providers/abacatepay/AbacatePayError';
import { createCustomerPortal } from 'src/providers/abacatepay/createCustomerPortal';
import { errorEnvelope, mockFetch, okEnvelope, sentRequest } from 'tests/unit/mockFetch';

describe('createCustomerPortal', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(okEnvelope({ url: 'https://app.abacatepay.com/portal/x' }));
  });

  test('POST /customer-portal/create com cliente e checkout', async () => {
    await createCustomerPortal({ customerId: 'cust_abc', checkoutId: 'bill_abc' });

    expect(sentRequest(fetchMock)).toMatchSnapshot();
  });

  test('checkoutId ausente é OMITIDO do JSON', async () => {
    await createCustomerPortal({ customerId: 'cust_abc' });

    expect(sentRequest(fetchMock).body).toEqual({ customerId: 'cust_abc' });
  });

  test('devolve a url', async () => {
    await expect(createCustomerPortal({ customerId: 'cust_abc' })).resolves.toEqual({
      url: 'https://app.abacatepay.com/portal/x',
    });
  });

  test.each([[{}], [{ url: '' }], [{ url: 1 }]])('sem url (%j) é erro', async (data) => {
    fetchMock.mockResolvedValue(okEnvelope(data));

    await expect(createCustomerPortal({ customerId: 'cust_abc' })).rejects.toBeInstanceOf(
      AbacatePayError
    );
  });

  test('checkout inexistente (400 "Checkout not found") sobe', async () => {
    fetchMock.mockResolvedValue(errorEnvelope('Checkout not found'));

    await expect(
      createCustomerPortal({ customerId: 'cust_abc', checkoutId: 'bill_nope' })
    ).rejects.toMatchObject({ status: 400 });
  });
});
