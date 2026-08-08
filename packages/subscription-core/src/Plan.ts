import type { Plan, PlanInterval } from '@vetor-wallet/shared';

/** Linha crua de `plans`, como sai do SQLite (snake_case, `active` como 0/1). */
export interface PlanRow {
  id: number;
  code: string;
  name: string;
  description: string;
  price_cents: number;
  interval: PlanInterval;
  active: number;
}

/** Projeta a linha na forma exposta pela API (`active` vira boolean). */
export const toPlan = (row: PlanRow): Plan => {
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    description: String(row.description),
    price_cents: Number(row.price_cents),
    interval: row.interval,
    active: Number(row.active) === 1,
  };
};
