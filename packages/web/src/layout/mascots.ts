/**
 * Mapa layer → mascote (T-004). Os PNGs vivem em `web/public/layers/*.png`.
 *
 * T-020: o header deixou de trocar de logo por layer (agora é `/logo.png`
 * fixo, ver `AppShell.tsx`) — este mapa hoje serve as pages de layer
 * (Renda, Despesas, Poupança, Metas, Dashboard, Cripto), cada uma exibindo
 * o próprio mascote via `mascotSrcForLayer`.
 */
export const MASCOT_FILE_BY_LAYER: Record<string, string> = {
  home: 'receitas-t.png',
  renda: 'receitas-t.png',
  despesas: 'despesas-t.png',
  poupanca: 'poupanca-t.png',
  metas: 'metas-t.png',
  cripto: 'cripto-t.png',
  carteiras: 'acoes-t.png',
  dash: 'acoes-t.png',
};

export const DEFAULT_MASCOT_LAYER = 'home';

/** Caminho do mascote de uma layer conhecida; layer desconhecida cai no mascote de `DEFAULT_MASCOT_LAYER`. */
export function mascotSrcForLayer(layer: string): string {
  return `/layers/${MASCOT_FILE_BY_LAYER[layer] ?? MASCOT_FILE_BY_LAYER[DEFAULT_MASCOT_LAYER]}`;
}
