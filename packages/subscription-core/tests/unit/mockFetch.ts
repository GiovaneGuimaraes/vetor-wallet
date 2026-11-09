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

/**
 * O que a função mandou ao provedor na chamada `n` — URL, método e corpo
 * parseado. É o alvo dos snapshots do provider: o contrato com a API é o que
 * uma review deixa passar.
 */
export const sentRequest = (fetchMock: jest.Mock, n = 0) => {
  const [url, init] = fetchMock.mock.calls[n];
  return {
    url,
    method: init.method,
    body: init.body === undefined ? undefined : JSON.parse(init.body),
  };
};

/** Recusa no formato do envelope: HTTP `status` com `error` preenchido. */
export const errorEnvelope = (error: unknown, status = 400) => {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data: null, error, success: false }),
  };
};

/**
 * Provedor de mentira roteado por CAMINHO (sem a base) — para as funções da
 * regra, que fazem várias chamadas ao provedor numa mesma execução. O handler
 * recebe o caminho com query string e o corpo parseado; rota sem resposta
 * lança, para chamada inesperada não passar em silêncio. Cede o event loop
 * antes de responder, como uma rede de verdade (é o que intercala corridas).
 */
export const routeFetch = (
  fetchMock: jest.Mock,
  handler: (path: string, body: any) => unknown
): void => {
  fetchMock.mockImplementation(async (url: string, init: { body?: string }) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const path = String(url).replace(/^https?:\/\/[^/]+\/v2/, '');
    const res = handler(path, init.body === undefined ? undefined : JSON.parse(init.body));
    if (res === undefined) throw new Error(`routeFetch: chamada inesperada a ${path}`);
    return res;
  });
};

/** Caminhos chamados, na ordem (sem a base). */
export const calledPaths = (fetchMock: jest.Mock): string[] => {
  return fetchMock.mock.calls.map(([url]) => String(url).replace(/^https?:\/\/[^/]+\/v2/, ''));
};
