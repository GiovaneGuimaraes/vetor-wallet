/**
 * Posição de um ticker: quantidade detida e preço médio ponderado de compra.
 * É o valor do `positionMap` que `applyOperation` mantém.
 */
export interface PositionEntry {
  quantity: number;
  avgPrice: number;
}

/**
 * Um preço de fechamento conhecido de um ticker num dia (uma linha de
 * `quote_snapshots` já reduzida ao par data/preço). `date` é `YYYY-MM-DD`.
 */
export interface SnapshotPoint {
  ticker: string;
  date: string;
  price: number;
}
