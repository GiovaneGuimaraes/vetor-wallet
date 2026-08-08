import { safeEqual } from 'src/safeEqual';

describe('safeEqual', () => {
  test('é true para strings iguais', () => {
    expect(safeEqual('segredo', 'segredo')).toBe(true);
  });

  test('é false para strings diferentes do mesmo tamanho', () => {
    expect(safeEqual('segredo', 'segreda')).toBe(false);
  });

  test('é false (SEM lançar) para tamanhos diferentes', () => {
    // `timingSafeEqual` joga RangeError com buffers de tamanhos diferentes, e
    // esse é justamente o caso mais comum de secret errado.
    expect(() => safeEqual('a', 'abcdef')).not.toThrow();
    expect(safeEqual('a', 'abcdef')).toBe(false);
  });

  test('string vazia contra qualquer coisa é false', () => {
    expect(safeEqual('', 'x')).toBe(false);
  });

  test('duas strings vazias são iguais', () => {
    expect(safeEqual('', '')).toBe(true);
  });

  test('compara BYTES, não caracteres (multibyte)', () => {
    expect(safeEqual('ção', 'ção')).toBe(true);
    expect(safeEqual('ção', 'cao')).toBe(false);
  });
});
