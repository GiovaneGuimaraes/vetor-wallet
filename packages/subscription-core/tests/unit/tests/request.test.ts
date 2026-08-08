import { AbacatePayError } from 'src/providers/abacatepay/AbacatePayError';
import {
  ABACATEPAY_DEFAULT_URL,
  ABACATEPAY_TIMEOUT_MS,
  abacatePayRequest,
} from 'src/providers/abacatepay/request';
import { mockFetch, okEnvelope, rawResponse } from 'tests/unit/mockFetch';

describe('abacatePayRequest', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
  });

  describe('montagem da request', () => {
    test('usa a URL default quando ABACATEPAY_API_URL não está setada', async () => {
      fetchMock.mockResolvedValue(okEnvelope({ ok: true }));

      await abacatePayRequest('/transparents/check', { method: 'GET' });

      expect(fetchMock.mock.calls[0][0]).toBe(`${ABACATEPAY_DEFAULT_URL}/transparents/check`);
    });

    test('respeita ABACATEPAY_API_URL (sandbox/local) e remove a barra final', async () => {
      process.env.ABACATEPAY_API_URL = 'https://sandbox.local/v2///';
      fetchMock.mockResolvedValue(okEnvelope({ ok: true }));

      await abacatePayRequest('/x', { method: 'GET' });

      expect(fetchMock.mock.calls[0][0]).toBe('https://sandbox.local/v2/x');
    });

    test('URL vazia/só espaços cai no default', async () => {
      process.env.ABACATEPAY_API_URL = '   ';
      fetchMock.mockResolvedValue(okEnvelope({ ok: true }));

      await abacatePayRequest('/x', { method: 'GET' });

      expect(fetchMock.mock.calls[0][0]).toBe(`${ABACATEPAY_DEFAULT_URL}/x`);
    });

    test('lê o env a CADA chamada, não no import do módulo', async () => {
      // É o que permite ao teste trocar credencial entre casos — e ao processo
      // carregar o .env depois deste módulo.
      fetchMock.mockResolvedValue(okEnvelope({ ok: true }));

      process.env.ABACATEPAY_API_KEY = 'primeira';
      await abacatePayRequest('/x', { method: 'GET' });
      process.env.ABACATEPAY_API_KEY = 'segunda';
      await abacatePayRequest('/x', { method: 'GET' });

      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer primeira');
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer segunda');
    });

    test('sem credencial ainda chama, com Bearer vazio', async () => {
      // Recusar aqui esconderia o erro do provedor; quem barra antes de chegar
      // à rede é `isAbacatePayConfigured` na rota (503 BILLING_NOT_CONFIGURED).
      delete process.env.ABACATEPAY_API_KEY;
      fetchMock.mockResolvedValue(okEnvelope({ ok: true }));

      await abacatePayRequest('/x', { method: 'GET' });

      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer ');
    });

    test('manda Bearer, Content-Type e Accept', async () => {
      fetchMock.mockResolvedValue(okEnvelope({ ok: true }));

      await abacatePayRequest('/x', { method: 'GET' });

      expect(fetchMock.mock.calls[0][1].headers).toEqual({
        Authorization: 'Bearer abc_key',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      });
    });

    test('serializa o body em JSON no POST', async () => {
      fetchMock.mockResolvedValue(okEnvelope({ ok: true }));

      await abacatePayRequest('/x', { method: 'POST', body: { a: 1 } });

      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
      expect(fetchMock.mock.calls[0][1].body).toBe('{"a":1}');
    });

    test('sem body não manda corpo nenhum', async () => {
      fetchMock.mockResolvedValue(okEnvelope({ ok: true }));

      await abacatePayRequest('/x', { method: 'GET' });

      expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    });

    test('aplica timeout via AbortSignal', async () => {
      const spy = jest.spyOn(AbortSignal, 'timeout');
      fetchMock.mockResolvedValue(okEnvelope({ ok: true }));

      await abacatePayRequest('/x', { method: 'GET' });

      // 10s, o dobro do brapi-core: cobrança não tem fallback nem cache.
      expect(spy).toHaveBeenCalledWith(ABACATEPAY_TIMEOUT_MS);
      expect(ABACATEPAY_TIMEOUT_MS).toBe(10_000);
      spy.mockRestore();
    });
  });

  describe('caminho feliz', () => {
    test('desembrulha o envelope e devolve só o data', async () => {
      fetchMock.mockResolvedValue(okEnvelope({ id: 'abc' }));

      await expect(abacatePayRequest('/x', { method: 'GET' })).resolves.toEqual({ id: 'abc' });
    });
  });

  describe('falhas — nunca degrada em silêncio', () => {
    test('erro de rede vira AbacatePayError com status 0', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNRESET'));

      const err = await abacatePayRequest('/x', { method: 'GET' }).catch((e) => e);

      expect(err).toBeInstanceOf(AbacatePayError);
      expect(err.status).toBe(0);
      expect(err.message).toContain('ECONNRESET');
      expect(err.message).toContain('/x');
    });

    test('rejeição sem message ainda vira erro legível', async () => {
      fetchMock.mockRejectedValue(undefined);

      const err = await abacatePayRequest('/x', { method: 'GET' }).catch((e) => e);

      expect(err.status).toBe(0);
      expect(err.message).toContain('erro desconhecido');
    });

    test('HTTP não-ok vira AbacatePayError com o status real', async () => {
      fetchMock.mockResolvedValue(rawResponse({ data: { id: 'abc' } }, 500));

      const err = await abacatePayRequest('/x', { method: 'GET' }).catch((e) => e);

      expect(err).toBeInstanceOf(AbacatePayError);
      expect(err.status).toBe(500);
    });

    test('HTTP 200 com `error` preenchido é FALHA (checar res.ok não basta)', async () => {
      fetchMock.mockResolvedValue(
        rawResponse({ data: null, error: 'saldo insuficiente', success: false }, 200)
      );

      const err = await abacatePayRequest('/x', { method: 'GET' }).catch((e) => e);

      expect(err).toBeInstanceOf(AbacatePayError);
      expect(err.status).toBe(200);
      expect(err.body).toMatchObject({ error: 'saldo insuficiente' });
    });

    test('HTTP 200 com data null é falha', async () => {
      fetchMock.mockResolvedValue(rawResponse({ data: null, error: null }, 200));

      await expect(abacatePayRequest('/x', { method: 'GET' })).rejects.toBeInstanceOf(
        AbacatePayError
      );
    });

    test('corpo não-JSON (HTML de proxy) vira AbacatePayError, não TypeError', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      });

      const err = await abacatePayRequest('/x', { method: 'GET' }).catch((e) => e);

      expect(err).toBeInstanceOf(AbacatePayError);
      expect(err.status).toBe(502);
      expect(err.body).toBeNull();
    });

    test('corpo JSON válido mas nulo é falha', async () => {
      fetchMock.mockResolvedValue(rawResponse(null, 200));

      await expect(abacatePayRequest('/x', { method: 'GET' })).rejects.toBeInstanceOf(
        AbacatePayError
      );
    });
  });
});
