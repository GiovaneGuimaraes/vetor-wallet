import { AlreadySubscribedError } from './AlreadySubscribedError';

/**
 * O usuário JÁ PAGOU um checkout cuja assinatura ainda não foi materializada
 * (`isActivationPending`). Abrir outro checkout seria convidar a pagar duas
 * vezes; o caminho é `sync` (`reconcileCardSubscription` recupera).
 *
 * Estende `AlreadySubscribedError` de propósito: uma rota que só conhece o
 * pai responde 409 `ALREADY_SUBSCRIBED`, que já é seguro; a que conhece o
 * filho pode dizer "confirmando pagamento" e disparar o `sync`.
 */
export class ActivationPendingError extends AlreadySubscribedError {
  constructor(message = 'Pagamento confirmado aguardando ativação') {
    super(message);
    this.name = 'ActivationPendingError';
  }
}
