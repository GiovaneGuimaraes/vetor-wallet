import { describe, expect, it } from 'vitest';
import { DEFAULT_CHART_WIDTH, computeChartBox } from './chartBox';

const opts = { ratio: 0.26, minHeight: 170, maxHeight: 240 };

describe('computeChartBox', () => {
  it('usa a largura medida (viewBox ~1:1 com os pixels) e limita a altura', () => {
    expect(computeChartBox(1100, opts)).toEqual({ width: 1100, height: 240 });
    expect(computeChartBox(800, opts)).toEqual({ width: 800, height: 208 });
    expect(computeChartBox(340, opts)).toEqual({ width: 340, height: 170 });
  });

  it('largura inválida (0, NaN, negativa) cai no padrão', () => {
    for (const w of [0, NaN, -5, Infinity]) {
      expect(computeChartBox(w, opts).width).toBe(DEFAULT_CHART_WIDTH);
    }
  });
});
