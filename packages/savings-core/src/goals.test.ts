import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';
import type { Goal } from '@vetor-wallet/shared';

// `services/goals` importa `../db`, que resolve a URL no module-eval. Como
// este arquivo só exercita a função pura, basta apontar para um arquivo temp
// para não tocar o banco de desenvolvimento.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-goals-service-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

type ResolveGoalProgress = typeof import('./goals')['resolveGoalProgress'];

const baseGoal: Goal = {
  id: 1,
  user_id: 1,
  name: 'Viagem',
  target_amount: 1000,
  current_amount: 300,
  created_at: '2025-01-01 00:00:00',
};

describe('resolveGoalProgress (T-024)', () => {
  let resolveGoalProgress: ResolveGoalProgress;

  beforeAll(async () => {
    ({ resolveGoalProgress } = await import('./goals'));
  });

  it('keeps the manual amount when there is no aggregate', () => {
    expect(resolveGoalProgress(baseGoal, undefined)).toMatchObject({
      current_amount: 300,
      progress_source: 'MANUAL',
      linked_entries_count: 0,
    });
  });

  it('keeps the manual amount when the aggregate has no entries', () => {
    expect(resolveGoalProgress(baseGoal, { count: 0, net: 0 })).toMatchObject({
      current_amount: 300,
      progress_source: 'MANUAL',
      linked_entries_count: 0,
    });
  });

  it('derives the amount from the linked net', () => {
    expect(resolveGoalProgress(baseGoal, { count: 3, net: 450 })).toMatchObject({
      current_amount: 450,
      progress_source: 'LINKED_SAVINGS',
      linked_entries_count: 3,
    });
  });

  it('rounds the derived amount to cents', () => {
    expect(resolveGoalProgress(baseGoal, { count: 2, net: 0.1 + 0.2 }).current_amount).toBe(0.3);
  });

  it('floors the derived amount at 0', () => {
    expect(resolveGoalProgress(baseGoal, { count: 2, net: -80 }).current_amount).toBe(0);
  });

  it('does not mutate the input goal', () => {
    const goal = { ...baseGoal };
    resolveGoalProgress(goal, { count: 1, net: 999 });
    expect(goal.current_amount).toBe(300);
  });
});
