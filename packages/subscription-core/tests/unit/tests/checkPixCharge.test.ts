import { checkPixCharge } from 'src/providers/abacatepay/checkPixCharge';
import { mockFetch, okEnvelope, rawCharge } from 'tests/unit/mockFetch';

describe('checkPixCharge', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(okEnvelope(rawCharge));
  });

  test('faz GET em /transparents/check com o id na query', async () => {
    await checkPixCharge('pix_char_abc');

    expect(fetchMock.mock.calls[0][0]).toContain('/transparents/check?id=pix_char_abc');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });

  test('escapa o id na querystring', async () => {
    await checkPixCharge('a b&c=d');

    expect(fetchMock.mock.calls[0][0]).toContain('id=a%20b%26c%3Dd');
  });

  test('devolve a cobrança normalizada com o status atual', async () => {
    fetchMock.mockResolvedValue(okEnvelope({ ...rawCharge, status: 'PAID' }));

    await expect(checkPixCharge('pix_char_abc')).resolves.toMatchObject({ status: 'PAID' });
  });

  test('propaga a falha do provedor', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));

    await expect(checkPixCharge('pix_char_abc')).rejects.toThrow('Falha de rede');
  });
});
