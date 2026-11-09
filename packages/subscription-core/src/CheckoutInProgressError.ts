/**
 * Outro checkout deste usuário está sendo criado agora (linha `CREATING` que o
 * índice único parcial `idx_subscription_checkouts_user_open` não deixa
 * duplicar). A rota traduz em 409 `CHECKOUT_IN_PROGRESS`.
 */
export class CheckoutInProgressError extends Error {
  constructor(message = 'Já existe um checkout de assinatura em criação') {
    super(message);
    this.name = 'CheckoutInProgressError';
  }
}
