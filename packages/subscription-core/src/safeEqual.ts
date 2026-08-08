import { timingSafeEqual } from 'crypto';

/**
 * Comparação de strings em tempo constante que **não lança**.
 *
 * `timingSafeEqual` exige buffers do mesmo tamanho (joga `RangeError` caso
 * contrário), e é justamente o caso mais comum de secret errado. Comprimento
 * diferente já é "não confere": vaza só o tamanho, que não é segredo.
 */
export const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};
