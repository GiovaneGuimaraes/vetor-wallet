import {
  createPixCharge,
  DEFAULT_EXPIRES_IN_SECONDS,
} from 'src/providers/abacatepay/createPixCharge';
import { mockFetch, okEnvelope, rawCharge } from 'tests/unit/mockFetch';

const input = {
  amountCents: 2990,
  description: 'Vetor Wallet — Pro Mensal',
  externalId: 'user:42:plan:1:1754049600000',
};

const bodyOf = (fetchMock: jest.Mock) => {
  return JSON.parse(fetchMock.mock.calls[0][1].body).data;
};

describe('createPixCharge', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    fetchMock.mockResolvedValue(okEnvelope(rawCharge));
  });

  test('faz POST em /transparents/create com method PIX', async () => {
    await createPixCharge(input);

    expect(fetchMock.mock.calls[0][0]).toContain('/transparents/create');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).method).toBe('PIX');
  });

  test('manda valor em centavos, descrição e externalId', async () => {
    await createPixCharge(input);

    expect(bodyOf(fetchMock)).toMatchObject({
      amount: 2990,
      description: 'Vetor Wallet — Pro Mensal',
      externalId: 'user:42:plan:1:1754049600000',
    });
  });

  test('usa 1h de expiração por default', async () => {
    await createPixCharge(input);

    expect(bodyOf(fetchMock).expiresIn).toBe(DEFAULT_EXPIRES_IN_SECONDS);
    expect(DEFAULT_EXPIRES_IN_SECONDS).toBe(3600);
  });

  test('respeita expiresInSeconds explícito', async () => {
    await createPixCharge({ ...input, expiresInSeconds: 60 });

    expect(bodyOf(fetchMock).expiresIn).toBe(60);
  });

  test('OMITE metadata/customer ausentes em vez de mandar null', async () => {
    // A API rejeita null onde espera objeto; `undefined` simplesmente não
    // serializa.
    await createPixCharge(input);

    const body = bodyOf(fetchMock);
    expect(body).not.toHaveProperty('metadata');
    expect(body).not.toHaveProperty('customer');
  });

  test('envia metadata e customer quando informados', async () => {
    await createPixCharge({
      ...input,
      metadata: { userId: 42, planId: 1 },
      customer: { email: 'a@b.com' },
    });

    expect(bodyOf(fetchMock)).toMatchObject({
      metadata: { userId: 42, planId: 1 },
      customer: { email: 'a@b.com' },
    });
  });

  test('devolve a cobrança normalizada', async () => {
    await expect(createPixCharge(input)).resolves.toEqual({
      id: 'pix_char_abc',
      amount: 2990,
      status: 'PENDING',
      brCode: '00020126...',
      brCodeBase64: 'data:image/png;base64,AAA',
      expiresAt: '2026-08-01T13:00:00.000Z',
      devMode: undefined,
    });
  });

  test('propaga a falha do provedor — nunca devolve cobrança vazia', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await expect(createPixCharge(input)).rejects.toThrow('AbacatePay respondeu erro');
  });
});
