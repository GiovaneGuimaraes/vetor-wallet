import { describe, expect, it } from 'vitest';
import { DEFAULT_MASCOT_LAYER, MASCOT_FILE_BY_LAYER, mascotSrcForLayer } from './mascots';

describe('mascotSrcForLayer', () => {
  it('devolve o caminho do mascote para cada layer conhecida', () => {
    for (const [layer, file] of Object.entries(MASCOT_FILE_BY_LAYER)) {
      expect(mascotSrcForLayer(layer)).toBe(`/layers/${file}`);
    }
  });

  it('cai no mascote da layer default quando a layer é desconhecida', () => {
    expect(mascotSrcForLayer('inexistente')).toBe(
      `/layers/${MASCOT_FILE_BY_LAYER[DEFAULT_MASCOT_LAYER]}`
    );
  });

  it('cai no mascote da layer default para string vazia', () => {
    expect(mascotSrcForLayer('')).toBe(`/layers/${MASCOT_FILE_BY_LAYER[DEFAULT_MASCOT_LAYER]}`);
  });
});
