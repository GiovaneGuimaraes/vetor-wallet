/**
 * O usuário já tem acesso pago (ou uma assinatura de cartão viva) e não pode
 * abrir outro checkout. A rota traduz em 409 `ALREADY_SUBSCRIBED`.
 *
 * Inclui o Pix legado dentro do período e a assinatura `canceled` que ainda tem
 * período pago (decisão 5 do humano: só assina no cartão DEPOIS de vencer).
 */
export class AlreadySubscribedError extends Error {
  constructor(message = 'Já existe uma assinatura ativa') {
    super(message);
    this.name = 'AlreadySubscribedError';
  }
}
