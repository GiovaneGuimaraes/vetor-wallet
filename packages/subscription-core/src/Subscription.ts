import type { Subscription } from '@vetor-wallet/shared';

/** Linha crua de `subscriptions`, como sai do SQLite. */
export interface SubscriptionRow {
  id: number;
  plan_id: number;
  status: Subscription['status'];
  current_period_end: string | null;
  created_at: string;
  // Colunas da T-124a — ausentes em quem monta a linha à mão.
  provider?: string | null;
  provider_status?: string | null;
  canceled_at?: string | null;
  abacate_subscription_id?: string | null;
  updated_at?: string | null;
}

export const toSubscription = (row: SubscriptionRow): Subscription => {
  return {
    id: Number(row.id),
    plan_id: Number(row.plan_id),
    status: row.status,
    current_period_end: row.current_period_end ?? null,
    created_at: String(row.created_at),
    // NULL = Pix legado. O id do provedor (`subs_…`) NUNCA sai daqui.
    provider: row.provider ?? null,
    provider_status: row.provider_status ?? null,
    canceled_at: row.canceled_at ?? null,
  };
};
