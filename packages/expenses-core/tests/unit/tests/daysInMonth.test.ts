import { daysInMonth } from 'src/daysInMonth';

describe('daysInMonth (T-035)', () => {
  it('conta meses de 31 e de 30 dias', () => {
    expect(daysInMonth('2026-01')).toBe(31);
    expect(daysInMonth('2026-04')).toBe(30);
    expect(daysInMonth('2026-12')).toBe(31);
  });

  it('conta fevereiro em ano comum e em bissexto', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2000-02')).toBe(29);
    expect(daysInMonth('1900-02')).toBe(28);
  });

  it('devolve 0 para chave de mês malformada', () => {
    for (const raw of ['2026-13', '2026-00', '2026-1', 'abc', '', '2026']) {
      expect(daysInMonth(raw)).toBe(0);
    }
  });
});
