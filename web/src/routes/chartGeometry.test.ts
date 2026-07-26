import { describe, expect, it } from 'vitest';
import {
  buildAreaPath,
  buildLinePath,
  buildProjectionSeries,
  computeValueDomain,
  MAX_SERIES_POINTS,
  pickTicks,
  scaleLinear,
} from './chartGeometry';
import { projectPortfolio } from './portfolioProjection';

describe('buildProjectionSeries', () => {
  it('projects with a positive rate (compound growth)', () => {
    const series = buildProjectionSeries(1000, 1, 2);
    expect(series).toEqual([
      { month: 0, value: 1000 },
      { month: 1, value: 1010 },
      { month: 2, value: 1020.1 },
    ]);
  });

  it('projects with a negative rate (decline scenario)', () => {
    const series = buildProjectionSeries(1000, -10, 2);
    expect(series).toEqual([
      { month: 0, value: 1000 },
      { month: 1, value: 900 },
      { month: 2, value: 810 },
    ]);
  });

  it('projects with a zero rate (flat line)', () => {
    const series = buildProjectionSeries(500, 0, 3);
    expect(series).toEqual([
      { month: 0, value: 500 },
      { month: 1, value: 500 },
      { month: 2, value: 500 },
      { month: 3, value: 500 },
    ]);
  });

  it('months = 0 returns a single point', () => {
    const series = buildProjectionSeries(1000, 2, 0);
    expect(series).toEqual([{ month: 0, value: 1000 }]);
  });

  it('resamples a long horizon (120 months) to at most MAX_SERIES_POINTS', () => {
    const series = buildProjectionSeries(1000, 0.5, 120);
    expect(series.length).toBeLessThanOrEqual(MAX_SERIES_POINTS);
    expect(series[0].month).toBe(0);
    expect(series[series.length - 1].month).toBe(120);
  });

  it('resampled series keeps the correct values at both extremes', () => {
    const series = buildProjectionSeries(1000, 1, 120);
    expect(series[0]).toEqual({ month: 0, value: 1000 });
    const last = series[series.length - 1];
    expect(last.month).toBe(120);
    expect(last.value).toBeCloseTo(1000 * Math.pow(1.01, 120), 1);
  });

  it('does not resample when total points already fit within the cap', () => {
    const series = buildProjectionSeries(1000, 1, 10);
    expect(series).toHaveLength(11);
    expect(series.map((p) => p.month)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('rejects a negative current value', () => {
    expect(buildProjectionSeries(-1, 1, 12)).toEqual([]);
  });

  it('rejects a non-finite current value', () => {
    expect(buildProjectionSeries(NaN, 1, 12)).toEqual([]);
    expect(buildProjectionSeries(Infinity, 1, 12)).toEqual([]);
  });

  it('rejects a rate at or below -100%', () => {
    expect(buildProjectionSeries(1000, -100, 12)).toEqual([]);
    expect(buildProjectionSeries(1000, -150, 12)).toEqual([]);
  });

  it('accepts a rate just above -100%', () => {
    const series = buildProjectionSeries(1000, -99, 1);
    expect(series[0].value).toBe(1000);
    expect(series[1].value).toBe(10);
  });

  it('rejects a non-integer months', () => {
    expect(buildProjectionSeries(1000, 1, 2.5)).toEqual([]);
  });

  it('rejects negative months', () => {
    expect(buildProjectionSeries(1000, 1, -1)).toEqual([]);
  });

  it('returns [] when the composition overflows number range', () => {
    expect(buildProjectionSeries(1e300, 1000, 500)).toEqual([]);
  });

  // ---------------------------------------------------------------------
  // T-062 — aporte mensal recorrente
  // ---------------------------------------------------------------------

  it('T-062: aporte ausente é idêntico a aporte 0 (retrocompatibilidade)', () => {
    expect(buildProjectionSeries(1000, 1, 12, 0)).toEqual(buildProjectionSeries(1000, 1, 12));
    expect(buildProjectionSeries(1000, -10, 2, 0)).toEqual(buildProjectionSeries(1000, -10, 2));
  });

  it('T-062: incorpora o aporte ponto a ponto (anuidade ordinária)', () => {
    // Mês 0 não tem aporte nenhum; o aporte do mês m entra no fim dele.
    expect(buildProjectionSeries(1000, 10, 2, 100)).toEqual([
      { month: 0, value: 1000 },
      { month: 1, value: 1200 }, // 1000×1,1 + 100
      { month: 2, value: 1420 }, // 1200×1,1 + 100
    ]);
  });

  it('T-062: taxa 0 com aporte cresce em linha reta', () => {
    expect(buildProjectionSeries(500, 0, 3, 50)).toEqual([
      { month: 0, value: 500 },
      { month: 1, value: 550 },
      { month: 2, value: 600 },
      { month: 3, value: 650 },
    ]);
  });

  it('T-062: valor atual 0 com aporte > 0 gera série válida', () => {
    expect(buildProjectionSeries(0, 10, 2, 100)).toEqual([
      { month: 0, value: 0 },
      { month: 1, value: 100 },
      { month: 2, value: 210 },
    ]);
  });

  it('T-062: rejeita aporte negativo ou não finito', () => {
    expect(buildProjectionSeries(1000, 1, 12, -1)).toEqual([]);
    expect(buildProjectionSeries(1000, 1, 12, Number.NaN)).toEqual([]);
    expect(buildProjectionSeries(1000, 1, 12, Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it('T-062: último ponto da série == futureValue de projectPortfolio (fonte única)', () => {
    const cases: Array<[number, number, number, number]> = [
      [1000, 1, 12, 100],
      [1000, 1, 12, 0],
      [0, 0.8, 36, 250],
      [5000, -1.5, 24, 300],
      [1234.56, 0.87, 120, 321.99], // prazo longo → série reamostrada
      [2500, 0, 18, 125],
    ];
    for (const [value, rate, months, contribution] of cases) {
      const series = buildProjectionSeries(value, rate, months, contribution);
      const projection = projectPortfolio(value, rate, months, contribution);
      expect(projection).not.toBeNull();
      expect(series.length).toBeGreaterThan(0);
      const last = series[series.length - 1];
      expect(last.month).toBe(months);
      expect(last.value).toBe(projection!.futureValue);
      // E o primeiro ponto é sempre o valor de partida (mês 0, sem aporte).
      expect(series[0]).toEqual({ month: 0, value: Math.round(value * 100) / 100 });
    }
  });

  it('T-062: série vazia quando projectPortfolio rejeita a entrada com aporte', () => {
    // A validação da série é a do próprio projectPortfolio — não há um segundo
    // conjunto de regras aqui.
    expect(buildProjectionSeries(0, 100, 5000, 100)).toEqual([]);
    expect(projectPortfolio(0, 100, 5000, 100)).toBeNull();
  });
});

describe('scaleLinear', () => {
  it('maps a value proportionally within the domain/range', () => {
    const scale = scaleLinear(0, 100, 0, 200);
    expect(scale(0)).toBe(0);
    expect(scale(50)).toBe(100);
    expect(scale(100)).toBe(200);
  });

  it('supports an inverted range (SVG y-axis: larger value -> smaller y)', () => {
    const scale = scaleLinear(0, 100, 200, 0);
    expect(scale(0)).toBe(200);
    expect(scale(100)).toBe(0);
    expect(scale(50)).toBe(100);
  });

  it('handles a degenerate domain (min === max) by returning the range center', () => {
    const scale = scaleLinear(500, 500, 0, 200);
    expect(scale(500)).toBe(100);
    expect(scale(0)).toBe(100);
    expect(scale(9999)).toBe(100);
  });
});

describe('computeValueDomain', () => {
  it('spans min/max of values plus baseline, with a 10% padding', () => {
    const domain = computeValueDomain([1000, 1010, 1020.1], 1000);
    const range = 1020.1 - 1000;
    expect(domain.min).toBeCloseTo(1000 - range * 0.1, 6);
    expect(domain.max).toBeCloseTo(1020.1 + range * 0.1, 6);
  });

  it('always includes the baseline even if outside the values range', () => {
    const domain = computeValueDomain([500, 600], 100);
    expect(domain.min).toBeLessThanOrEqual(100);
    expect(domain.max).toBeGreaterThanOrEqual(600);
  });

  it('pads a degenerate (flat) range proportionally to a non-zero baseline', () => {
    const domain = computeValueDomain([1000, 1000, 1000], 1000);
    expect(domain.min).toBeCloseTo(900, 6);
    expect(domain.max).toBeCloseTo(1100, 6);
  });

  it('falls back to the minimum absolute padding when the baseline is 0', () => {
    const domain = computeValueDomain([0, 0], 0);
    expect(domain.min).toBe(-1);
    expect(domain.max).toBe(1);
  });
});

describe('buildLinePath', () => {
  it('builds an M/L path with limited precision', () => {
    const path = buildLinePath([
      { x: 0, y: 10.005 },
      { x: 50.128, y: 5 },
      { x: 100, y: 0 },
    ]);
    expect(path).toBe('M 0 10.01 L 50.13 5 L 100 0');
  });

  it('returns an empty string for an empty series', () => {
    expect(buildLinePath([])).toBe('');
  });
});

describe('buildAreaPath', () => {
  it('closes the line down to the baseline and back to the start', () => {
    const path = buildAreaPath(
      [
        { x: 0, y: 10 },
        { x: 100, y: 0 },
      ],
      50,
    );
    expect(path).toBe('M 0 10 L 100 0 L 100 50 L 0 50 Z');
  });

  it('returns an empty string for an empty series', () => {
    expect(buildAreaPath([], 50)).toBe('');
  });

  // T-059: pinning do comportamento atual para série de 1 ponto (ex.: months = 0
  // em buildProjectionSeries) — o path fecha um polígono degenerado (largura
  // zero, mesmo x no início/fim), mas continua sendo um `d` de path válido, sem
  // erro/NaN. Documentado como comportamento esperado, não um bug.
  it('produces a degenerate but valid path for a single-point series', () => {
    const path = buildAreaPath([{ x: 5, y: 10 }], 50);
    expect(path).toBe('M 5 10 L 5 50 L 5 50 Z');
  });
});

describe('pickTicks', () => {
  it('picks start/middle/end for a small count', () => {
    const series = [{ month: 0 }, { month: 1 }, { month: 2 }, { month: 3 }, { month: 4 }];
    expect(pickTicks(series, 3)).toEqual([{ month: 0 }, { month: 2 }, { month: 4 }]);
  });

  it('spreads evenly for a larger count without exceeding series length', () => {
    const series = Array.from({ length: 24 }, (_, i) => i);
    const ticks = pickTicks(series, 5);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(23);
    expect(ticks.length).toBeLessThanOrEqual(5);
  });

  it('returns just the first element for count <= 1', () => {
    const series = [10, 20, 30];
    expect(pickTicks(series, 1)).toEqual([10]);
    expect(pickTicks(series, 0)).toEqual([10]);
  });

  it('returns a single point series unchanged', () => {
    expect(pickTicks([42], 5)).toEqual([42]);
  });

  it('returns [] for an empty series', () => {
    expect(pickTicks([], 5)).toEqual([]);
  });
});
