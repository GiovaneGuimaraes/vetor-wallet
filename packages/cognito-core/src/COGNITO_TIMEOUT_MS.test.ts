import { describe, it, expect } from 'vitest';
import { COGNITO_TIMEOUT_MS } from './COGNITO_TIMEOUT_MS';

describe('COGNITO_TIMEOUT_MS (T-106)', () => {
  it('é 10s: mais folgado que a brapi (5s) e mais curto que a Pluggy (15s)', () => {
    expect(COGNITO_TIMEOUT_MS).toBe(10_000);
  });
});
