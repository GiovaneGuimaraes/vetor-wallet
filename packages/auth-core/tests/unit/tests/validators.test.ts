import { isValidEmail } from 'src/isValidEmail';
import { isValidName } from 'src/isValidName';
import { isValidPhone } from 'src/isValidPhone';
import { normalizePhone } from 'src/normalizePhone';

describe('isValidEmail', () => {
  it('aceita e-mail comum e recusa sem @, sem domínio ou com espaço', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('sem-arroba.com')).toBe(false);
    expect(isValidEmail('a@semponto')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
  });
});

describe('isValidName', () => {
  it('aceita 1–120 caracteres após trim e recusa vazio/espaços/longo demais', () => {
    expect(isValidName('Ana')).toBe(true);
    expect(isValidName('a'.repeat(120))).toBe(true);
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('')).toBe(false);
    expect(isValidName('a'.repeat(121))).toBe(false);
  });
});

describe('normalizePhone / isValidPhone', () => {
  it('normaliza para dígitos puros', () => {
    expect(normalizePhone('+55 (11) 91234-5678')).toBe('5511912345678');
  });

  it('aceita DDD + 8/9 dígitos, com ou sem 55', () => {
    expect(isValidPhone('(11) 91234-5678')).toBe(true);
    expect(isValidPhone('1112345678')).toBe(true);
    expect(isValidPhone('+55 11 91234-5678')).toBe(true);
  });

  it('recusa curto, longo demais e vazio', () => {
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('551191234567890')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });
});
