/**
 * Converte reais em centavos inteiros, para comparação exata de dinheiro.
 *
 * **A invariante do domínio** (T-052): toda soma de dinheiro da poupança passa
 * por aqui antes de ser somada. Somar floats direto faria `0,10 + 0,20` virar
 * `0.30000000000000004` e produzir um centavo de divergência entre o saldo e o
 * `summary` em razões grandes.
 */
export function toCents(value: number): number {
  return Math.round(value * 100);
}
