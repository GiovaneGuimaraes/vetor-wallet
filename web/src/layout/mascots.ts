/**
 * Mapa layer → mascote (T-004). Os PNGs em `web/public/layers/*.png` são
 * copiados pela T-003 (paralela) — os paths abaixo são referenciados mesmo
 * que os arquivos ainda não existam neste worktree; ver README do handoff
 * (`design_handoff_vetor_wallet_refactor/README.md`, seção "Mascotes").
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

/** Extrai a "layer" (primeiro segmento do path) a partir de um pathname de rota. */
export function layerFromPathname(pathname: string): string {
  const first = pathname.split('/').filter(Boolean)[0];
  return first && first in MASCOT_FILE_BY_LAYER ? first : DEFAULT_MASCOT_LAYER;
}

export function mascotSrcForPathname(pathname: string): string {
  const layer = layerFromPathname(pathname);
  return `/layers/${MASCOT_FILE_BY_LAYER[layer] ?? MASCOT_FILE_BY_LAYER[DEFAULT_MASCOT_LAYER]}`;
}
