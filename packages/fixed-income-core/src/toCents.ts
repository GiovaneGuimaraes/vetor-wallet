/**
 * Converte reais em centavos inteiros, para somar dinheiro sem erro de float.
 *
 * Cópia deliberada da função de mesmo nome do `savings-core`: a regra 6 de
 * `docs/PACKAGES.md` proíbe core → core de módulo diferente, e uma linha
 * duplicada (com teste próprio) custa menos que esse acoplamento.
 */
export function toCents(value: number): number {
  return Math.round(value * 100);
}
