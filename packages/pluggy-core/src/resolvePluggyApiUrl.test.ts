import { describe, it, expect, afterEach } from 'vitest';
import { DEFAULT_PLUGGY_API_URL, resolvePluggyApiUrl } from './resolvePluggyApiUrl';

const original = process.env.PLUGGY_API_URL;

afterEach(() => {
  if (original === undefined) delete process.env.PLUGGY_API_URL;
  else process.env.PLUGGY_API_URL = original;
});

describe('resolvePluggyApiUrl (T-087)', () => {
  it('usa https://api.pluggy.ai por default', () => {
    delete process.env.PLUGGY_API_URL;
    expect(resolvePluggyApiUrl()).toBe(DEFAULT_PLUGGY_API_URL);
    expect(DEFAULT_PLUGGY_API_URL).toBe('https://api.pluggy.ai');
  });

  it('cai no default quando a env está vazia ou só com espaços', () => {
    process.env.PLUGGY_API_URL = '   ';
    expect(resolvePluggyApiUrl()).toBe(DEFAULT_PLUGGY_API_URL);
  });

  it('respeita PLUGGY_API_URL e remove a barra final', () => {
    process.env.PLUGGY_API_URL = 'https://sandbox.pluggy.test/';
    expect(resolvePluggyApiUrl()).toBe('https://sandbox.pluggy.test');

    process.env.PLUGGY_API_URL = 'https://sandbox.pluggy.test///';
    expect(resolvePluggyApiUrl()).toBe('https://sandbox.pluggy.test');
  });
});
