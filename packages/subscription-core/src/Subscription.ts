import type { Subscription } from '@vetor-wallet/shared';

/** Linha crua de `subscriptions`, como sai do SQLite. */
export interface SubscriptionRow {
  id: number;
  plan_id: number;
  status: Subscription['status'];
  current_period_end: string | null;
  created_at: string;
}

export const toSubscription = (row: SubscriptionRow): Subscription => {
  return {
    id: Number(row.id),
    plan_id: Number(row.plan_id),
    status: row.status,
    current_period_end: row.current_period_end ?? null,
    created_at: String(row.created_at),
  };
};
