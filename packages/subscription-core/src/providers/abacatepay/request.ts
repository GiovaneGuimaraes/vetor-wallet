import { AbacatePayError } from './AbacatePayError';

/** Base da API v2. Sobreponível por `ABACATEPAY_API_URL` (sandbox/local). */
export const ABACATEPAY_DEFAULT_URL = 'https://api.abacatepay.com/v2';

/**
 * Timeout dos fetches: 10s, o dobro do `brapi-core`. Cotação tem fallback (a
 * request segue com `quotesUnavailable`) e cache de snapshots; cobrança não tem
 * nem um nem outro — se o POST de criação estourar, o usuário fica sem QR Code.
 * Vale esperar o dobro antes de desistir.
 */
export const ABACATEPAY_TIMEOUT_MS = 10_000;

/** A API responde sempre neste envelope — e pode devolver HTTP 200 com `error` preenchido. */
interface Envelope<T> {
  data?: T | null;
  error?: unknown;
  success?: boolean;
}

/**
 * Faz a chamada e desembrulha o envelope.
 *
 * **Nunca degrada em silêncio**: ao contrário de `fetchQuotes`, qualquer falha
 * (rede, timeout, HTTP não-ok, envelope com erro, corpo não-JSON) vira
 * `AbacatePayError` lançado — nunca `null`/valor vazio. Engolir a falha de uma
 * cobrança criaria assinatura sem pagamento (ou o inverso).
 *
 * Checar `res.ok` não basta justamente por causa do envelope: a API responde
 * 200 com `error` preenchido em vários casos de recusa.
 *
 * O env é lido DENTRO da função (e não no top-level do módulo) porque é o padrão
 * do repo e o que permite aos testes trocar `ABACATEPAY_API_URL`/
 * `ABACATEPAY_API_KEY` entre casos.
 */
export const abacatePayRequest = async <T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown }
): Promise<T> => {
  const apiKey = (process.env.ABACATEPAY_API_KEY ?? '').trim();
  const baseUrl = (process.env.ABACATEPAY_API_URL ?? '').trim() || ABACATEPAY_DEFAULT_URL;
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(ABACATEPAY_TIMEOUT_MS),
    });
  } catch (err) {
    // Rede/timeout: nenhuma resposta chegou → status 0.
    throw new AbacatePayError(
      `Falha de rede ao chamar a AbacatePay (${path}): ${(err as Error)?.message ?? 'erro desconhecido'}`,
      0
    );
  }

  // Corpo pode não ser JSON (502 de proxy, HTML de erro): não deixa o parse
  // vazar como TypeError, vira AbacatePayError com o status HTTP real.
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = null;
  }

  if (!res.ok || body == null || body.error != null || body.data == null) {
    throw new AbacatePayError(
      `AbacatePay respondeu erro em ${path} (HTTP ${res.status})`,
      res.status,
      body
    );
  }

  return body.data;
};
