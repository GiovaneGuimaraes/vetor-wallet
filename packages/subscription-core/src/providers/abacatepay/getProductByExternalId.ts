import { type AbacateProduct, type RawAbacateProduct, toAbacateProduct } from './AbacateProduct';
import { AbacatePayError } from './AbacatePayError';
import { abacatePayRequest } from './request';

/** Texto do `error` do envelope, venha como string ou como `{ message }`. */
const errorText = (body: unknown): string => {
  if (body == null || typeof body !== 'object') return '';
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (error != null && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
};

/**
 * "O provedor respondeu que o produto não existe" — e SÓ isso. Rede/timeout
 * (status 0), 5xx e qualquer outra recusa não são "não existe": tratá-los como
 * `null` faria quem chama criar um segundo produto por cima de um blip.
 */
const isNotFound = (err: unknown): boolean => {
  if (!(err instanceof AbacatePayError)) return false;
  if (err.status === 404) return true;
  if (err.status !== 400 && err.status !== 200) return false;
  // HTTP 200 com `data: null` e sem `error`: o provedor respondeu com sucesso
  // que não há nada (o `abacatePayRequest` lança porque `data == null`).
  const body = err.body as { data?: unknown; error?: unknown } | null | undefined;
  if (err.status === 200 && body != null && body.data == null && body.error == null) return true;
  return /not\s*found|n[ãa]o\s+encontrad/i.test(errorText(err.body));
};

/**
 * Busca o produto pela NOSSA chave. Devolve `null` quando o provedor responde
 * que não existe; é como se recupera da corrida em `createProduct` (dois
 * criadores, um leva 400 "already exists" e lê o do outro por aqui).
 */
export const getProductByExternalId = async (
  externalId: string
): Promise<AbacateProduct | null> => {
  let raw: RawAbacateProduct;
  try {
    raw = await abacatePayRequest<RawAbacateProduct>(
      `/products/get?externalId=${encodeURIComponent(externalId)}`,
      { method: 'GET' }
    );
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }

  return toAbacateProduct(raw);
};
