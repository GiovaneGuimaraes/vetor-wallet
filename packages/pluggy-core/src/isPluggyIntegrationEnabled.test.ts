import { describe, it, expect } from 'vitest';
import { isPluggyIntegrationEnabled } from './isPluggyIntegrationEnabled';

describe('isPluggyIntegrationEnabled (T-089b, revisto 2026-11-08)', () => {
  it('sempre libera — não há deploy de produção para proteger ainda', () => {
    expect(isPluggyIntegrationEnabled()).toBe(true);
  });
});
