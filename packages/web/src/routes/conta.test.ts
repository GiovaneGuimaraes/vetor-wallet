import { describe, it, expect } from 'vitest';
import { formatPhoneForDisplay, normalizePhoneForSubmit, onlyDigits, greetingName } from './conta';

describe('onlyDigits', () => {
  it('strips everything that is not a digit', () => {
    expect(onlyDigits('(11) 98765-4321')).toBe('11987654321');
    expect(onlyDigits('+55 11 3265-4321')).toBe('551132654321');
  });
});

describe('formatPhoneForDisplay', () => {
  it('formats an 11-digit mobile number', () => {
    expect(formatPhoneForDisplay('11987654321')).toBe('(11) 98765-4321');
  });

  it('formats a 10-digit landline number', () => {
    expect(formatPhoneForDisplay('1132654321')).toBe('(11) 3265-4321');
  });

  it('strips the country code before formatting', () => {
    expect(formatPhoneForDisplay('5511987654321')).toBe('(11) 98765-4321');
  });

  it('formats a value that already carries a mask', () => {
    expect(formatPhoneForDisplay('(11) 98765-4321')).toBe('(11) 98765-4321');
  });

  it('returns raw digits when the number is incomplete', () => {
    expect(formatPhoneForDisplay('1198')).toBe('1198');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(formatPhoneForDisplay(null)).toBe('');
    expect(formatPhoneForDisplay(undefined)).toBe('');
    expect(formatPhoneForDisplay('')).toBe('');
  });
});

describe('normalizePhoneForSubmit', () => {
  it('keeps only digits regardless of mask', () => {
    expect(normalizePhoneForSubmit('(11) 98765-4321')).toBe('11987654321');
    expect(normalizePhoneForSubmit('11987654321')).toBe('11987654321');
    expect(normalizePhoneForSubmit('')).toBe('');
  });
});

describe('greetingName', () => {
  it('uses the first token of the real name when present', () => {
    expect(greetingName('Ana Silva', 'ana@test.com')).toBe('Ana');
  });

  it('falls back to the email prefix when name is null', () => {
    expect(greetingName(null, 'joao@test.com')).toBe('joao');
  });

  it('falls back to the email prefix when name is undefined', () => {
    expect(greetingName(undefined, 'joao@test.com')).toBe('joao');
  });

  it('falls back to the email prefix when name is blank/whitespace', () => {
    expect(greetingName('   ', 'joao@test.com')).toBe('joao');
  });

  it('trims surrounding whitespace from the name before splitting', () => {
    expect(greetingName('  Maria Clara  ', 'maria@test.com')).toBe('Maria');
  });
});
