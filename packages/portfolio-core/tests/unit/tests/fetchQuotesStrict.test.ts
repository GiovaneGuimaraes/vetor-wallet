import { fetchQuotesStrict } from 'src/fetchQuotesStrict';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('fetchQuotesStrict', () => {
  const originalToken = process.env.BRAPI_TOKEN;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalToken === undefined) delete process.env.BRAPI_TOKEN;
    else process.env.BRAPI_TOKEN = originalToken;
  });

  it('monta o mapa ticker → preço e chama a brapi SEM token quando não há BRAPI_TOKEN', async () => {
    delete process.env.BRAPI_TOKEN;
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        results: [
          { symbol: 'PETR4', regularMarketPrice: 38.5 },
          { symbol: 'VALE3', regularMarketPrice: 61 },
        ],
      })
    );

    const map = await fetchQuotesStrict(['PETR4', 'VALE3']);

    expect(map).toEqual(
      new Map([
        ['PETR4', 38.5],
        ['VALE3', 61],
      ])
    );
    expect(fetchSpy.mock.calls[0][0]).toBe('https://brapi.dev/api/quote/PETR4,VALE3');
  });

  it('anexa o token na query quando BRAPI_TOKEN existe', async () => {
    process.env.BRAPI_TOKEN = 'tok-de-teste';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ results: [{ symbol: 'PETR4', regularMarketPrice: 1 }] }));

    await fetchQuotesStrict(['PETR4']);

    expect(fetchSpy.mock.calls[0][0]).toBe('https://brapi.dev/api/quote/PETR4?token=tok-de-teste');
  });

  it('LANÇA em status não-ok — é o que deixa o withRetry agir', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, false, 503));

    await expect(fetchQuotesStrict(['PETR4'])).rejects.toThrow('brapi responded with 503');
  });

  it('LANÇA quando a resposta vem sem nenhum resultado para tickers pedidos', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}));

    await expect(fetchQuotesStrict(['PETR4'])).rejects.toThrow('brapi returned empty results');
  });

  it('sem tickers pedidos, resposta vazia é um mapa vazio (não erro)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ results: [] }));

    await expect(fetchQuotesStrict([])).resolves.toEqual(new Map());
  });
});
