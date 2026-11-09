import { AbacatePayError } from './AbacatePayError';

/**
 * "O provedor respondeu SUCESSO, só que sem `data`" — HTTP 2xx, envelope sem
 * `error`, `success` diferente de `false` e `data` nulo.
 *
 * `abacatePayRequest` lança nesse caso (ele exige `data` para devolver algo
 * tipado), o que está certo para quem precisa do objeto de volta. Para as
 * chamadas de AÇÃO que devolvem `void` — cancelar, arquivar, apagar checkout —
 * lançar seria mentir: a ação aconteceu. Nota do revisor da T-124a: o corpo de
 * sucesso desses endpoints nunca foi observado, e se vier `data: null` o
 * cancelamento seria reportado como falha apesar de ter cancelado.
 *
 * Qualquer sinal de recusa (status fora de 2xx, `error` preenchido,
 * `success: false`, corpo que não é JSON) NÃO é sucesso vazio.
 */
export const isEmptySuccess = (err: unknown): boolean => {
  if (!(err instanceof AbacatePayError)) return false;
  if (err.status < 200 || err.status > 299) return false;
  const body = err.body as { data?: unknown; error?: unknown; success?: unknown } | null;
  if (body == null || typeof body !== 'object') return false;
  return body.error == null && body.data == null && body.success !== false;
};
