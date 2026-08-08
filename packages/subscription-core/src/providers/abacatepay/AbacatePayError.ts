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
