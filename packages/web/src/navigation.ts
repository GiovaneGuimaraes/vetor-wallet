/**
 * Sai do app para uma URL externa (checkout/portal hospedados da AbacatePay,
 * T-124c). Isolado num módulo para o teste de render poder mocká-lo: no jsdom
 * `window.location.assign` não navega e não é substituível por spy.
 */
export function redirectTo(url: string): void {
  window.location.assign(url);
}
