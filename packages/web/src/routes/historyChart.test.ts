import { describe, expect, it } from 'vitest';
import type { PortfolioHistoryPoint } from '@vetor-wallet/shared';
import { buildHistoryIndexScale, computeHistoryDomain, isHistoryDown } from './historyChart';

function point(date: string, value: number, invested: number): PortfolioHistoryPoint {
  return { date, value, invested };
}

describe('computeHistoryDomain', () => {
  it('spans the min/max across BOTH value and invested, with 10% padding', () => {
    const points = [point('2026-07-01', 1000, 900), point('2026-07-02', 1100, 900)];
    const domain = computeHistoryDomain(points);
    const range = 1100 - 900;
    expect(domain.min).toBeCloseTo(900 - range * 0.1, 6);
    expect(domain.max).toBeCloseTo(1100 + range * 0.1, 6);
  });

  it('does not clip the invested line when it is outside the value range', () => {
    // invested (custo) maior que o valor de mercado atual (carteira no
    // prejuízo) — o domínio precisa cobrir os dois, não só `value`.
    const points = [point('2026-07-01', 500, 800)];
    const domain = computeHistoryDomain(points);
    expect(domain.min).toBeLessThanOrEqual(500);
    expect(domain.max).toBeGreaterThanOrEqual(800);
  });

  it('handles a single point (degenerate range) with the minimum absolute padding', () => {
    const domain = computeHistoryDomain([point('2026-07-01', 1000, 1000)]);
    expect(domain.min).toBeCloseTo(900, 6);
    expect(domain.max).toBeCloseTo(1100, 6);
  });

  it('handles an empty series without NaN/Infinity', () => {
    const domain = computeHistoryDomain([]);
    expect(domain.min).toBe(-1);
    expect(domain.max).toBe(1);
  });

  it('is unaffected by gaps in the dates (only the point values matter)', () => {
    // dias ausentes (fim de semana etc.) não entram na resposta — a função
    // só olha para os valores dos pontos que existem, não para as datas.
    const points = [
      point('2026-07-01', 1000, 900),
      point('2026-07-10', 1050, 900), // buraco de 9 dias antes deste ponto
    ];
    const domain = computeHistoryDomain(points);
    expect(domain.min).toBeLessThanOrEqual(900);
    expect(domain.max).toBeGreaterThanOrEqual(1050);
  });
});

describe('isHistoryDown', () => {
  it('is false when the series ends at or above where it started', () => {
    const flat = [point('2026-07-01', 1000, 900), point('2026-07-02', 1000, 900)];
    expect(isHistoryDown(flat)).toBe(false);

    const up = [point('2026-07-01', 1000, 900), point('2026-07-02', 1100, 900)];
    expect(isHistoryDown(up)).toBe(false);
  });

  it('is true when the last value is below the first', () => {
    const down = [point('2026-07-01', 1000, 900), point('2026-07-02', 900, 900)];
    expect(isHistoryDown(down)).toBe(true);
  });

  it('is false (neutral) for 0 or 1 points — nothing to compare', () => {
    expect(isHistoryDown([])).toBe(false);
    expect(isHistoryDown([point('2026-07-01', 1000, 900)])).toBe(false);
  });
});

describe('buildHistoryIndexScale', () => {
  it('maps point index proportionally to the pixel range', () => {
    const scale = buildHistoryIndexScale(5, 0, 200);
    expect(scale(0)).toBe(0);
    expect(scale(2)).toBe(100);
    expect(scale(4)).toBe(200);
  });

  it('centers a single point in the range (degenerate domain)', () => {
    const scale = buildHistoryIndexScale(1, 0, 200);
    expect(scale(0)).toBe(100);
  });

  it('handles zero points without dividing by zero', () => {
    const scale = buildHistoryIndexScale(0, 0, 200);
    expect(scale(0)).toBe(100);
  });
});
