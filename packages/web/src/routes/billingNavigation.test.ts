import { describe, expect, it } from 'vitest';
import { shouldNavigateToPlans } from './billingNavigation';

describe('shouldNavigateToPlans', () => {
  it('não navega quando já estamos em /planos', () => {
    expect(shouldNavigateToPlans('/planos')).toBe(false);
  });

  it('navega uma vez quando estamos em outra rota', () => {
    expect(shouldNavigateToPlans('/home')).toBe(true);
  });
});
