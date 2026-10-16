/**
 * Posição de um ticker: quantidade detida e preço médio ponderado de compra.
 * É o valor do `positionMap` que `applyOperation` mantém.
 */
export interface PositionEntry {
  quantity: number;
  avgPrice: number;
}
