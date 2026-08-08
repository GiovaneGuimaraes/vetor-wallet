import { simulatePixPayment } from 'src/providers/abacatepay/simulatePixPayment';
import { mockFetch, okEnvelope, rawCharge } from 'tests/unit/mockFetch';

describe('simulatePixPayment', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(okEnvelope({ ...rawCharge, status: 'PAID', devMode: true }));
  });

  test('faz POST em /transparents/simulate-payment com o id na query', async () => {
    await simulatePixPayment('pix_char_abc');

    expect(fetchMock.mock.calls[0][0]).toContain('/transparents/simulate-payment?id=pix_char_abc');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  test('escapa o id na querystring', async () => {
    await simulatePixPayment('a b');

    expect(fetchMock.mock.calls[0][0]).toContain('id=a%20b');
  });

  test('NÃO checa NODE_ENV — a guarda de ambiente é da rota', async () => {
    // Manter isso como client HTTP puro é o que permite testar sem mexer em env
    // de ambiente; a rota é quem responde 404 em produção.
    process.env.NODE_ENV = 'production';

    await expect(simulatePixPayment('pix_char_abc')).resolves.toMatchObject({ status: 'PAID' });
  });

  test('devolve a cobrança normalizada', async () => {
    await expect(simulatePixPayment('pix_char_abc')).resolves.toMatchObject({
      status: 'PAID',
      devMode: true,
    });
  });

  test('propaga a falha do provedor', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });

    await expect(simulatePixPayment('pix_char_abc')).rejects.toThrow('AbacatePay respondeu erro');
  });
});
