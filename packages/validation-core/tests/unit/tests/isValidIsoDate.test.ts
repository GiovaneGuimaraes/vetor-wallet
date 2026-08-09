import { isValidIsoDate } from 'src/isValidIsoDate';

describe('isValidIsoDate', () => {
  it('aceita datas reais comuns', () => {
    expect(isValidIsoDate('2026-07-25')).toBe(true);
    expect(isValidIsoDate('2026-01-01')).toBe(true);
    expect(isValidIsoDate('2026-12-31')).toBe(true);
  });

  it('aceita 29/02 em ano bissexto', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
  });

  it('rejeita 29/02 em ano não bissexto', () => {
    expect(isValidIsoDate('2026-02-29')).toBe(false);
  });

  it('respeita meses curtos', () => {
    expect(isValidIsoDate('2026-04-30')).toBe(true);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
  });

  it('rejeita mês inexistente', () => {
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-01')).toBe(false);
  });

  it('rejeita dia inexistente', () => {
    expect(isValidIsoDate('2026-07-00')).toBe(false);
    expect(isValidIsoDate('2026-07-32')).toBe(false);
  });

  it('rejeita formato inválido', () => {
    expect(isValidIsoDate('2026-7-25')).toBe(false);
    expect(isValidIsoDate('25-07-2026')).toBe(false);
    expect(isValidIsoDate('2026/07/25')).toBe(false);
    expect(isValidIsoDate('2026-07-25T00:00:00Z')).toBe(false);
  });

  it('rejeita strings vazias e valores não-string', () => {
    expect(isValidIsoDate('')).toBe(false);
    expect(isValidIsoDate(undefined)).toBe(false);
    expect(isValidIsoDate(null)).toBe(false);
    expect(isValidIsoDate(123)).toBe(false);
  });
});
