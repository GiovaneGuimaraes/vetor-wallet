import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  ABACATEPAY_DEFAULT_URL,
  AbacatePayError,
  checkPixCharge,
  createPixCharge,
  isAbacatePayConfigured,
  simulatePixPayment,
} from './abacatepay';

const RAW_CHARGE = {
  id: 'pix_char_123',
  amount: 990,
  status: 'PENDING' as const,
  brCode: '00020101...',
  brCodeBase64: 'data:image/png;base64,AAA',
  expiresAt: '2026-08-01T12:00:00.000Z',
  devMode: true,
};

function okResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data, error: null, success: true }) };
}

describe('abacatepay client', () => {
  const originalKey = process.env.ABACATEPAY_API_KEY;
  const originalUrl = process.env.ABACATEPAY_API_URL;

  beforeEach(() => {
    process.env.ABACATEPAY_API_KEY = 'test-key';
    delete process.env.ABACATEPAY_API_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.ABACATEPAY_API_KEY;
    else process.env.ABACATEPAY_API_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.ABACATEPAY_API_URL;
    else process.env.ABACATEPAY_API_URL = originalUrl;
  });

  it('createPixCharge posts to the default base URL with Bearer auth, PIX body and abort signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(RAW_CHARGE));
    vi.stubGlobal('fetch', fetchMock);

    await createPixCharge({
      amountCents: 990,
      description: 'Pro Mensal',
      externalId: 'sub-7',
      metadata: { userId: 7 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ABACATEPAY_DEFAULT_URL}/transparents/create`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    expect(init.signal).toBeDefined();
    expect(JSON.parse(init.body)).toEqual({
      method: 'PIX',
      data: {
        amount: 990,
        description: 'Pro Mensal',
        expiresIn: 3600, // default quando expiresInSeconds é omitido
        externalId: 'sub-7',
        metadata: { userId: 7 },
      },
    });
  });

  it('createPixCharge honours a custom ABACATEPAY_API_URL and an explicit expiresInSeconds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(RAW_CHARGE));
    vi.stubGlobal('fetch', fetchMock);
    process.env.ABACATEPAY_API_URL = 'https://sandbox.example.com/v2';

    await createPixCharge({
      amountCents: 9900,
      description: 'Pro Anual',
      externalId: 'sub-8',
      expiresInSeconds: 60,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sandbox.example.com/v2/transparents/create');
    expect(JSON.parse(init.body).data.expiresIn).toBe(60);
    // Opcionais ausentes são omitidos do JSON, não enviados como null.
    expect(JSON.parse(init.body).data).not.toHaveProperty('metadata');
    expect(JSON.parse(init.body).data).not.toHaveProperty('customer');
  });

  it('createPixCharge maps the envelope payload to AbacatePixCharge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(RAW_CHARGE)));

    const charge = await createPixCharge({
      amountCents: 990,
      description: 'Pro Mensal',
      externalId: 'sub-7',
    });

    expect(charge).toEqual({
      id: 'pix_char_123',
      amount: 990,
      status: 'PENDING',
      brCode: '00020101...',
      brCodeBase64: 'data:image/png;base64,AAA',
      expiresAt: '2026-08-01T12:00:00.000Z',
      devMode: true,
    });
  });

  it('normalizes a missing expiresAt to null', async () => {
    const { expiresAt: _omit, ...withoutExpiry } = RAW_CHARGE;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(withoutExpiry)));

    const charge = await createPixCharge({
      amountCents: 990,
      description: 'Pro Mensal',
      externalId: 'sub-7',
    });

    expect(charge.expiresAt).toBeNull();
  });

  it('throws AbacatePayError when HTTP 200 carries an error in the envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: null, error: 'invalid amount', success: false }),
      }),
    );

    await expect(
      createPixCharge({ amountCents: 0, description: 'x', externalId: 'sub-7' }),
    ).rejects.toBeInstanceOf(AbacatePayError);
  });

  it('throws AbacatePayError with status 401 on an unauthorized response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ data: null, error: 'unauthorized', success: false }),
      }),
    );

    const error = await createPixCharge({
      amountCents: 990,
      description: 'x',
      externalId: 'sub-7',
    }).catch((e) => e);

    expect(error).toBeInstanceOf(AbacatePayError);
    expect((error as AbacatePayError).status).toBe(401);
    expect((error as AbacatePayError).body).toEqual({
      data: null,
      error: 'unauthorized',
      success: false,
    });
  });

  it('throws AbacatePayError with status 0 on a network rejection (never returns null)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const error = await createPixCharge({
      amountCents: 990,
      description: 'x',
      externalId: 'sub-7',
    }).catch((e) => e);

    expect(error).toBeInstanceOf(AbacatePayError);
    expect((error as AbacatePayError).status).toBe(0);
  });

  it('checkPixCharge issues a GET with the charge id URL-encoded', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ ...RAW_CHARGE, status: 'PAID' }));
    vi.stubGlobal('fetch', fetchMock);

    const charge = await checkPixCharge('pix char/123');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `${ABACATEPAY_DEFAULT_URL}/transparents/check?id=pix%20char%2F123`,
    );
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(charge.status).toBe('PAID');
  });

  it('simulatePixPayment issues a POST with an empty body and the encoded id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ ...RAW_CHARGE, status: 'PAID' }));
    vi.stubGlobal('fetch', fetchMock);

    const charge = await simulatePixPayment('pix_char_123');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `${ABACATEPAY_DEFAULT_URL}/transparents/simulate-payment?id=pix_char_123`,
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({});
    expect(charge.status).toBe('PAID');
  });

  it('isAbacatePayConfigured is false without an API key and true with one', () => {
    delete process.env.ABACATEPAY_API_KEY;
    expect(isAbacatePayConfigured()).toBe(false);

    process.env.ABACATEPAY_API_KEY = '   ';
    expect(isAbacatePayConfigured()).toBe(false);

    process.env.ABACATEPAY_API_KEY = 'abc_123';
    expect(isAbacatePayConfigured()).toBe(true);
  });
});
