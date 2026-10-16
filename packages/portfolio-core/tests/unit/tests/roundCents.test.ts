import { roundCents } from 'src/roundCents';

describe('roundCents', () => {
  it('corta o ruído de float para centavos', () => {
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(roundCents(30.299999999999997)).toBe(30.3);
  });

  it('arredonda meio centavo para cima e preserva inteiros e zero', () => {
    expect(roundCents(1.005 * 1000)).toBe(1005);
    expect(roundCents(10.125)).toBe(10.13);
    expect(roundCents(0)).toBe(0);
  });
});
