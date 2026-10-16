/** Arredonda em centavos — a série é exibida em BRL, não faz sentido carregar ruído de float. */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}
