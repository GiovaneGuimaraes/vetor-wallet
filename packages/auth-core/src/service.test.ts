import { describe, it, expect, vi } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  isValidEmail,
  isValidName,
  isValidPhone,
  normalizePhone,
} from './service';

// Isolate pure functions from db — createUser/findUserByEmail are tested via router integration
vi.mock('@vetor-wallet/db', () => ({
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

describe('isValidEmail', () => {
  it('accepts a well-formed email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('rejects missing @ or domain', () => {
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('userexample.com')).toBe(false);
    expect(isValidEmail('user@example')).toBe(false);
  });
});

describe('isValidName (T-092)', () => {
  it('accepts a 1-120 char name after trim', () => {
    expect(isValidName('Ana')).toBe(true);
    expect(isValidName('  Ana  ')).toBe(true);
    expect(isValidName('a'.repeat(120))).toBe(true);
  });

  it('rejects empty/whitespace-only or too-long names', () => {
    expect(isValidName('')).toBe(false);
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('a'.repeat(121))).toBe(false);
  });
});

describe('normalizePhone / isValidPhone (T-092)', () => {
  it('strips non-digit characters', () => {
    expect(normalizePhone('(11) 98765-4321')).toBe('11987654321');
    expect(normalizePhone('+55 11 98765-4321')).toBe('5511987654321');
  });

  it('accepts DDD + 8 or 9 digit numbers, with or without +55', () => {
    expect(isValidPhone('11987654321')).toBe(true); // DDD + 9 digits
    expect(isValidPhone('1132654321')).toBe(true); // DDD + 8 digits
    expect(isValidPhone('+55 11 98765-4321')).toBe(true);
    expect(isValidPhone('5511987654321')).toBe(true);
  });

  it('rejects too short/too long or malformed numbers', () => {
    expect(isValidPhone('123456')).toBe(false);
    expect(isValidPhone('119876543210000')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });
});
