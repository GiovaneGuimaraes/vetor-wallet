/**
 * Substitui o `fetch` global por um mock.
 *
 * O provider é o único ponto de rede do package e não recebe client injetado —
 * `fetch` já é a "injeção" que o runtime oferece. Trocar o global é o
 * equivalente, para HTTP, do `db` de mentira usado nas funções com banco.
 */
export const mockFetch = (): jest.Mock => {
  const fn = jest.fn();
  global.fetch = fn as unknown as typeof fetch;
  return fn;
};

/** Resposta com envelope `{ data }` — o caminho feliz da API. */
export const okEnvelope = (data: unknown, status = 200) => {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data, error: null, success: true }),
  };
};

export const rawResponse = (body: unknown, status = 200) => {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
};

export const rawCharge = {
  id: 'pix_char_abc',
  amount: 2990,
  status: 'PENDING' as const,
  brCode: '00020126...',
  brCodeBase64: 'data:image/png;base64,AAA',
  expiresAt: '2026-08-01T13:00:00.000Z',
};
