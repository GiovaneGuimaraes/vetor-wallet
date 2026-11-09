import type { Query } from '@vetor-wallet/query';

import { ActivationPendingError } from './ActivationPendingError';
import { AlreadySubscribedError } from './AlreadySubscribedError';
import { selectUserSubscriptionText } from './applyProviderSubscriptionState';
import { getLatestCompletedCheckout } from './getLatestCompletedCheckout';
import { isActivationPending } from './isActivationPending';
import { isSubscriptionActive } from './isSubscriptionActive';

interface SubRow {
  status: string;
  current_period_end: string | null;
  abacate_subscription_id: string | null;
  updated_at: string | null;
}

/**
 * Lança se o usuário NÃO pode abrir um checkout de cartão agora (T-124c,
 * extraída de `startCardCheckout`, que segue chamando esta mesma função).
 *
 * - **`AlreadySubscribedError`**: qualquer assinatura dentro do período
 *   (`isSubscriptionActive` — inclui Pix legado e `canceled` com período pago:
 *   só assina no cartão DEPOIS de vencer) e assinatura de cartão `active` mesmo
 *   VENCIDA localmente — o `subs_` dela pode estar cobrando.
 * - **`ActivationPendingError`** (filho do anterior): o último checkout
 *   `COMPLETED` foi pago e a assinatura ainda não foi gravada — o caminho é o
 *   `sync`, não outro pagamento.
 *
 * Existe separada para a ROTA poder perguntar isto ANTES de criar o cliente na
 * AbacatePay: sem ela, um assinante Pix legado que clicasse "Assinar" ganharia
 * um `cust_` no provedor só para levar 409. Só lê; não grava nada.
 */
export const assertCanStartCheckout = async (args: {
  query: Query;
  userId: number;
  /** Instante no formato SQLite UTC (`toSqliteUtc`). */
  now: string;
}): Promise<void> => {
  const { query, userId, now } = args;
  const subRes = await query<SubRow>({ text: selectUserSubscriptionText, values: [userId] });
  const sub = subRes.rows[0];
  if (isSubscriptionActive(sub, now) || (sub?.abacate_subscription_id && sub.status === 'active')) {
    throw new AlreadySubscribedError();
  }
  // Pagou um checkout cuja assinatura ainda não foi gravada (crash/corrida):
  // abrir outro seria cobrar duas vezes. A saída é o `sync`, que recupera.
  if (isActivationPending(await getLatestCompletedCheckout({ query, userId }), sub)) {
    throw new ActivationPendingError();
  }
};
