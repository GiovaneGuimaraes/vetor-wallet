import { describe, it, expect } from 'vitest';
import type { Goal } from '@vetor-wallet/shared';
import { progressPct, progressPctClamped, isDerivedProgress, progressSourceLabel } from './goalsProgress';

function goal(partial: Partial<Goal> = {}): Goal {
  return {
    id: 1,
    user_id: 1,
    name: 'Viagem',
    target_amount: 1000,
    current_amount: 250,
    created_at: '2025-01-01 00:00:00',
    ...partial,
  };
}

describe('progressPct', () => {
  it('computes the raw percentage', () => {
    expect(progressPct(goal())).toBe(25);
  });

  it('returns 0 when target is not positive', () => {
    expect(progressPct(goal({ target_amount: 0 }))).toBe(0);
  });

  it('can exceed 100 when the goal is surpassed', () => {
    expect(progressPct(goal({ current_amount: 1500 }))).toBe(150);
  });
});

describe('progressPctClamped', () => {
  it('clamps above 100', () => {
    expect(progressPctClamped(goal({ current_amount: 1500 }))).toBe(100);
  });

  it('clamps below 0', () => {
    expect(progressPctClamped(goal({ current_amount: -50 }))).toBe(0);
  });
});

describe('isDerivedProgress (T-024)', () => {
  it('is false for goals without progress_source (legacy payloads)', () => {
    expect(isDerivedProgress(goal())).toBe(false);
  });

  it('is false for MANUAL goals', () => {
    expect(isDerivedProgress(goal({ progress_source: 'MANUAL' }))).toBe(false);
  });

  it('is true for LINKED_SAVINGS goals', () => {
    expect(isDerivedProgress(goal({ progress_source: 'LINKED_SAVINGS' }))).toBe(true);
  });
});

describe('progressSourceLabel', () => {
  it('labels manual goals', () => {
    expect(progressSourceLabel(goal({ progress_source: 'MANUAL' }))).toBe('Progresso manual');
  });

  it('uses the singular form for one linked entry', () => {
    expect(progressSourceLabel(goal({ progress_source: 'LINKED_SAVINGS', linked_entries_count: 1 }))).toBe(
      'Progresso automático · 1 lançamento vinculado',
    );
  });

  it('uses the plural form for multiple linked entries', () => {
    expect(progressSourceLabel(goal({ progress_source: 'LINKED_SAVINGS', linked_entries_count: 3 }))).toBe(
      'Progresso automático · 3 lançamentos vinculados',
    );
  });
});
