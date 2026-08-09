import { parseDaysParam } from 'src/parseDaysParam';

describe('parseDaysParam (T-068)', () => {
  it('param ausente devolve o default', () => {
    expect(parseDaysParam(undefined, 90, 365)).toBe(90);
  });

  it('aceita inteiro decimal dentro da faixa', () => {
    expect(parseDaysParam('1', 90, 365)).toBe(1);
    expect(parseDaysParam('30', 90, 365)).toBe(30);
    expect(parseDaysParam('365', 90, 365)).toBe(365);
  });

  it('rejeita não-inteiro, negativo, texto, espaços, array e número', () => {
    expect(parseDaysParam('1.5', 90, 365)).toBeNull();
    expect(parseDaysParam('-1', 90, 365)).toBeNull();
    expect(parseDaysParam('abc', 90, 365)).toBeNull();
    expect(parseDaysParam(' 5', 90, 365)).toBeNull();
    expect(parseDaysParam(['5', '6'], 90, 365)).toBeNull();
    expect(parseDaysParam(5, 90, 365)).toBeNull();
  });

  it('rejeita fora da faixa [1, maxDays]', () => {
    expect(parseDaysParam('0', 90, 365)).toBeNull();
    expect(parseDaysParam('366', 90, 365)).toBeNull();
  });
});
