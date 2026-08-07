/**
 * Client HTTP da AbacatePay (T-069) — cobrança Pix da assinatura.
 *
 * A API responde sempre num envelope `{ data, error, success }` e **pode
 * responder HTTP 200 com `error` preenchido**, então checar `res.ok` não basta.
 *
 * Duas divergências conscientes em relação a `services/quotes.ts`:
 *
 * 1. **Timeout de 10s, não 5s.** Cotação tem fallback (a request segue com
 *    `quotesUnavailable`) e cache de snapshots; cobrança não tem nem um nem
 *    outro — se o POST de criação estourar, o usuário fica sem QR Code. Vale
 *    esperar o dobro antes de desistir.
 * 2. **Nunca retorna `null`/valor vazio em falha.** `fetchQuotes` degrada em
 *    silêncio porque preço ausente é tolerável; aqui qualquer falha vira
 *    `AbacatePayError`. Dinheiro exige erro explícito: engolir a falha de uma
 *    cobrança criaria assinatura sem pagamento (ou o inverso).
 */

/** Base da API v2. Sobreponível por `ABACATEPAY_API_URL` (sandbox/local). */
export const ABACATEPAY_DEFAULT_URL = 'https://api.abacatepay.com/v2';

/** Timeout dos fetches — ver nota 1 no topo do arquivo. */
const TIMEOUT_MS = 10_000;

/** Expiração default da cobrança Pix: 1 hora. */
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

export type AbacatePixChargeStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED';

/** Cobrança Pix normalizada — a forma que o resto do server consome. */
export interface AbacatePixCharge {
  /** Id da cobrança no provedor (gravado em `pix_charges.abacate_charge_id`). */
  id: string;
  /** Valor em CENTAVOS, como o provedor transaciona. */
  amount: number;
  status: AbacatePixChargeStatus;
  /** Payload Pix copia-e-cola. */
  brCode: string;
  /** Mesmo payload como imagem QR em base64 (data URI). */
  brCodeBase64: string;
  /** ISO 8601 ou null quando o provedor não informa expiração. */
  expiresAt: string | null;
  /** true quando a cobrança foi criada em ambiente de testes do provedor. */
  devMode?: boolean;
}

export interface CreatePixChargeInput {
  /** Valor em CENTAVOS. */
  amountCents: number;
  description: string;
  /** Default 3600 (1h). */
  expiresInSeconds?: number;
  /** Nossa referência da cobrança (usada para reconciliar no webhook). */
  externalId: string;
  metadata?: Record<string, unknown>;
  customer?: Record<string, unknown>;
}

/**
 * Falha em qualquer chamada à AbacatePay.
 *
 * `status` é o HTTP code quando houve resposta; **0 significa erro de rede ou
 * timeout** (nenhuma resposta chegou) — a distinção importa para quem decide
 * entre "recusado pelo provedor" e "não sabemos, pode ter passado".
 */
export class AbacatePayError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'AbacatePayError';
    this.status = status;
    this.body = body;
  }
}

interface Envelope<T> {
  data?: T | null;
  error?: unknown;
  success?: boolean;
}

/** true quando há credencial configurada — sem ela o billing fica indisponível. */
export function isAbacatePayConfigured(): boolean {
  return (process.env.ABACATEPAY_API_KEY ?? '').trim().length > 0;
}

/**
 * Faz a chamada e desembrulha o envelope. O env é lido DENTRO da função (e não
 * no top-level do módulo) porque é o padrão do repo e o que permite aos testes
 * trocar `ABACATEPAY_API_URL`/`ABACATEPAY_API_KEY` entre casos.
 */
async function request<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // Rede/timeout: nenhuma resposta chegou → status 0.
    throw new AbacatePayError(
      `Falha de rede ao chamar a AbacatePay (${path}): ${(err as Error)?.message ?? 'erro desconhecido'}`,
      0,
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
      body,
    );
  }

  return body.data;
}

interface RawCharge {
  id: string;
  amount: number;
  status: AbacatePixChargeStatus;
  brCode: string;
  brCodeBase64: string;
  expiresAt?: string | null;
  devMode?: boolean;
}

function toPixCharge(raw: RawCharge): AbacatePixCharge {
  return {
    id: raw.id,
    amount: raw.amount,
    status: raw.status,
    brCode: raw.brCode,
    brCodeBase64: raw.brCodeBase64,
    expiresAt: raw.expiresAt ?? null,
    devMode: raw.devMode,
  };
}

/** Cria uma cobrança Pix (QR Code + copia-e-cola). */
export async function createPixCharge(input: CreatePixChargeInput): Promise<AbacatePixCharge> {
  // Campos opcionais ausentes são OMITIDOS do JSON (undefined não serializa),
  // em vez de enviados como null — a API rejeita null onde espera objeto.
  const raw = await request<RawCharge>('/transparents/create', {
    method: 'POST',
    body: {
      method: 'PIX',
      data: {
        amount: input.amountCents,
        description: input.description,
        expiresIn: input.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS,
        externalId: input.externalId,
        metadata: input.metadata,
        customer: input.customer,
      },
    },
  });

  return toPixCharge(raw);
}

/** Consulta o status atual de uma cobrança pelo id do provedor. */
export async function checkPixCharge(chargeId: string): Promise<AbacatePixCharge> {
  const raw = await request<RawCharge>(
    `/transparents/check?id=${encodeURIComponent(chargeId)}`,
    { method: 'GET' },
  );

  return toPixCharge(raw);
}

/**
 * Simula o pagamento de uma cobrança (só funciona em cobranças `devMode` do
 * provedor). O service **não** checa `NODE_ENV` de propósito: a guarda de
 * ambiente pertence à rota que expõe isso (T-070), mantendo este módulo como
 * client HTTP puro e testável sem mexer em env de ambiente.
 */
export async function simulatePixPayment(chargeId: string): Promise<AbacatePixCharge> {
  const raw = await request<RawCharge>(
    `/transparents/simulate-payment?id=${encodeURIComponent(chargeId)}`,
    { method: 'POST', body: {} },
  );

  return toPixCharge(raw);
}
