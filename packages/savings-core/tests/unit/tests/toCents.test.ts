import { toCents } from 'src/toCents';

describe('toCents', () => {
  it('converte reais em centavos inteiros', () => {
    expect(toCents(0)).toBe(0);
    expect(toCents(1)).toBe(100);
    expect(toCents(12.34)).toBe(1234);
  });

  it('absorve o erro de representação de valores com 2 casas', () => {
    // 0.1 + 0.2 é 0.30000000000000004; sem o round, somar em float divergiria.
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(8.29)).toBe(829);
  });

  it('arredonda o PRODUTO, e por isso meio centavo exato pode cair para baixo', () => {
    // Borda conhecida e aceita: 1.005 * 100 já vale 100.49999999999999 em ponto
    // flutuante, então o round devolve 100, não 101. O app nunca chega aqui —
    // `isValidMoneyAmount` recusa mais de 2 casas decimais antes de gravar —,
    // mas o comportamento está fixado em teste para não mudar sem querer.
    expect(toCents(1.005)).toBe(100);
  });

  it('preserva o sinal', () => {
    expect(toCents(-4.2)).toBe(-420);
  });
});
