/**
 * T-072/T-101: decisão pura do handler de `billing:subscription-required`
 * (ver `App.tsx`). Extraída para módulo testável — a guarda existe para que
 * uma rajada de respostas 402 em paralelo não empilhe navegações para
 * `/planos` quando já estamos lá.
 */
export function shouldNavigateToPlans(currentPathname: string): boolean {
  return currentPathname !== '/planos';
}
