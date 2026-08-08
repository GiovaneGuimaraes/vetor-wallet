import { addInterval } from 'src/addInterval';

describe('addInterval', () => {
  test('soma um mês mantendo dia e hora, em UTC', () => {
    expect(addInterval('2026-08-01 12:34:56', 'monthly')).toBe('2026-09-01 12:34:56');
  });

  test('soma um ano', () => {
    expect(addInterval('2026-08-01 12:34:56', 'yearly')).toBe('2027-08-01 12:34:56');
  });

  test('faz clamp de 31/01 para 28/02 (mês destino mais curto)', () => {
    expect(addInterval('2026-01-31 10:00:00', 'monthly')).toBe('2026-02-28 10:00:00');
  });

  test('faz clamp de 31/03 para 30/04', () => {
    expect(addInterval('2026-03-31 00:00:00', 'monthly')).toBe('2026-04-30 00:00:00');
  });

  test('clampa para 29/02 quando o ano destino é bissexto', () => {
    expect(addInterval('2028-01-31 00:00:00', 'monthly')).toBe('2028-02-29 00:00:00');
  });

  test('faz clamp de 29/02 (bissexto) para 28/02 no ano seguinte', () => {
    expect(addInterval('2028-02-29 08:00:00', 'yearly')).toBe('2029-02-28 08:00:00');
  });

  test('vira o ano quando soma um mês em dezembro', () => {
    expect(addInterval('2026-12-15 23:59:59', 'monthly')).toBe('2027-01-15 23:59:59');
  });

  test('aceita entrada em ISO 8601 com Z e devolve o formato do SQLite', () => {
    expect(addInterval('2026-08-01T12:00:00.000Z', 'monthly')).toBe('2026-09-01 12:00:00');
  });
});
