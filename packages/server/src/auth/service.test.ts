import { describe, it, expect, vi } from 'vitest';
import { hashPassword, verifyPassword } from './service';

// Isolate pure functions from db — createUser/findUserByEmail are tested via router integration
vi.mock('../db', () => ({
  db: {
    execute: vi.fn(),
    batch: vi.fn(),
  },
}));

describe('hashPassword / verifyPassword', () => {
  it('produces a hash that verifies correctly', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('each hash is unique (no deterministic output)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
  });
});
