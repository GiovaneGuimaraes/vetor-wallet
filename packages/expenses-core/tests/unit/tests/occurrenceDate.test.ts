import { occurrenceDate } from 'src/occurrenceDate';

describe('occurrenceDate (T-035)', () => {
  it('mantém o dia quando o mês é longo o bastante', () => {
    expect(occurrenceDate('2026-01', 15)).toBe('2026-01-15');
    expect(occurrenceDate('2026-01', 31)).toBe('2026-01-31');
  });

  it('prende o dia 31 ao último dia de meses curtos', () => {
    expect(occurrenceDate('2026-04', 31)).toBe('2026-04-30');
    expect(occurrenceDate('2026-06', 31)).toBe('2026-06-30');
  });

  it('prende os dias 29 e 30 em fevereiro', () => {
    expect(occurrenceDate('2026-02', 30)).toBe('2026-02-28');
    expect(occurrenceDate('2026-02', 29)).toBe('2026-02-28');
    expect(occurrenceDate('2028-02', 29)).toBe('2028-02-29');
  });

  it('nunca transborda para o mês seguinte', () => {
    for (const month of ['2026-02', '2026-04', '2026-09', '2026-11']) {
      expect(occurrenceDate(month, 31).startsWith(month)).toBe(true);
    }
  });

  it('põe piso 1 no dia e zera casas decimais', () => {
    expect(occurrenceDate('2026-01', 0)).toBe('2026-01-01');
    expect(occurrenceDate('2026-01', -5)).toBe('2026-01-01');
    expect(occurrenceDate('2026-01', 3.9)).toBe('2026-01-03');
  });

  it('preenche o dia com zero à esquerda', () => {
    expect(occurrenceDate('2026-01', 5)).toBe('2026-01-05');
  });

  it('mês malformado devolve string vazia', () => {
    expect(occurrenceDate('2026-13', 10)).toBe('');
  });
});
