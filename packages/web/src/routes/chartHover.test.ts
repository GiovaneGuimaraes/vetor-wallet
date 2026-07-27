import { describe, expect, it } from 'vitest';
import { findNearestIndex, positionTooltip } from './chartHover';

describe('findNearestIndex', () => {
  it('devolve null para série vazia', () => {
    expect(findNearestIndex([], 50)).toBeNull();
  });

  it('devolve 0 para série de 1 ponto, qualquer pointerX', () => {
    expect(findNearestIndex([100], 0)).toBe(0);
    expect(findNearestIndex([100], 100)).toBe(0);
    expect(findNearestIndex([100], 9999)).toBe(0);
  });

  it('clampa no primeiro ponto quando pointerX vem antes dele', () => {
    expect(findNearestIndex([50, 100, 150], -100)).toBe(0);
    expect(findNearestIndex([50, 100, 150], 0)).toBe(0);
  });

  it('clampa no último ponto quando pointerX vem depois dele', () => {
    expect(findNearestIndex([50, 100, 150], 200)).toBe(2);
    expect(findNearestIndex([50, 100, 150], 1000)).toBe(2);
  });

  it('escolhe o ponto mais próximo no meio da série', () => {
    expect(findNearestIndex([0, 50, 100, 150], 40)).toBe(1);
    expect(findNearestIndex([0, 50, 100, 150], 60)).toBe(1);
    expect(findNearestIndex([0, 50, 100, 150], 76)).toBe(2);
  });

  it('em empate exato de distância, o índice menor vence', () => {
    expect(findNearestIndex([0, 100], 50)).toBe(0);
  });

  it('funciona com um único ponto no meio de valores não nulos', () => {
    expect(findNearestIndex([37], -500)).toBe(0);
  });
});

describe('positionTooltip', () => {
  const VIEW_WIDTH = 320;
  const TOOLTIP_WIDTH = 90;

  it('ancora à esquerda (start) quando há espaço até a borda direita', () => {
    const pos = positionTooltip(50, 60, VIEW_WIDTH, TOOLTIP_WIDTH);
    expect(pos.anchor).toBe('start');
    expect(pos.x).toBe(50);
  });

  it('ancora à direita (end) quando estouraria a borda direita', () => {
    const pos = positionTooltip(300, 60, VIEW_WIDTH, TOOLTIP_WIDTH);
    expect(pos.anchor).toBe('end');
    expect(pos.x).toBe(300);
  });

  it('desloca y para cima pelo offset default', () => {
    const pos = positionTooltip(50, 60, VIEW_WIDTH, TOOLTIP_WIDTH);
    expect(pos.y).toBe(48);
  });

  it('aceita offsetY customizado', () => {
    const pos = positionTooltip(50, 60, VIEW_WIDTH, TOOLTIP_WIDTH, 20);
    expect(pos.y).toBe(40);
  });

  it('borda exata (ponto encostado na borda direita) ainda ancora start quando cabe', () => {
    const pos = positionTooltip(VIEW_WIDTH - TOOLTIP_WIDTH, 60, VIEW_WIDTH, TOOLTIP_WIDTH);
    expect(pos.anchor).toBe('start');
  });
});
