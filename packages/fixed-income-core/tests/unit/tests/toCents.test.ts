import { toCents } from 'src/toCents';

describe('toCents', () => {
  it('converte reais em centavos inteiros', () => {
    expect(toCents(0)).toBe(0);
    expect(toCents(1)).toBe(100);
    expect(toCents(12.34)).toBe(1234);
  });

  it('absorve o erro de representação de valores com 2 casas', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(8.29)).toBe(829);
  });

  it('preserva o sinal', () => {
    expect(toCents(-4.2)).toBe(-420);
  });
});
