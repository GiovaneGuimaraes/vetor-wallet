import { describe, expect, it } from 'vitest';
import type { DailyClose } from '@vetor-wallet/shared';
import {
  formatIndexPoints,
  periodChange,
  slicePeriod,
  sparklinePath,
  tickerLabel,
  trendTone,
} from './stockCharts';

/** Pregões consecutivos (sem fim de semana, não importa aqui) a partir de `start`. */
function series(start: string, closes: number[]): DailyClose[] {
  const base = Date.parse(`${start}T00:00:00Z`);
  return closes.map((close, i) => ({
    date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    close,
  }));
}

describe('slicePeriod', () => {
  const pts = series(
    '2026-08-20',
    Array.from({ length: 98 }, (_, i) => i + 1)
  ); // até 2026-11-25

  it('3M devolve tudo; vazio devolve vazio', () => {
    expect(slicePeriod(pts, '3M')).toBe(pts);
    expect(slicePeriod([], '1M')).toEqual([]);
  });

  it('5D = últimos 5 pregões', () => {
    expect(slicePeriod(pts, '5D').map((p) => p.close)).toEqual([94, 95, 96, 97, 98]);
  });

  it('1M conta do último ponto, não de hoje (inclui o mesmo dia do mês anterior)', () => {
    const m = slicePeriod(pts, '1M');
    expect(m[0].date).toBe('2026-10-25');
    expect(m[m.length - 1].date).toBe('2026-11-25');
  });

  it('1M ajusta o dia ao fim do mês (31/03 → 28/02)', () => {
    const p = series(
      '2026-02-20',
      Array.from({ length: 40 }, () => 1)
    ); // até 2026-03-31
    expect(slicePeriod(p, '1M')[0].date).toBe('2026-02-28');
  });
});

describe('periodChange / trendTone', () => {
  it('início, fim e variação do período', () => {
    expect(periodChange(series('2026-11-01', [10, 11, 12.5]))).toEqual({
      start: 10,
      end: 12.5,
      abs: 2.5,
      pct: 25,
    });
  });

  it('menos de 2 pontos → null; preço inicial 0 → pct null', () => {
    expect(periodChange(series('2026-11-01', [10]))).toBeNull();
    expect(periodChange(series('2026-11-01', [0, 1]))?.pct).toBeNull();
  });

  it('verde na alta, vermelho na baixa, neutro sem variação/sem dado', () => {
    expect(trendTone(series('2026-11-01', [10, 11]))).toBe('up');
    expect(trendTone(series('2026-11-01', [10, 9]))).toBe('down');
    expect(trendTone(series('2026-11-01', [10, 10.0001]))).toBe('flat');
    expect(trendTone([])).toBe('flat');
    expect(trendTone(series('2026-11-01', [0, 1]))).toBe('flat');
  });
});

describe('sparklinePath', () => {
  it('X por índice, Y invertido entre mínimo e máximo com respiro', () => {
    expect(sparklinePath([1, 3, 2], 100, 20, 2)).toBe('M0 18 L50 2 L100 10');
  });

  it('série constante é reta no meio; < 2 pontos → null', () => {
    expect(sparklinePath([5, 5], 10, 20)).toBe('M0 10 L10 10');
    expect(sparklinePath([5], 10, 20)).toBeNull();
  });
});

describe('rótulos', () => {
  it('formata pontos do índice e nomeia o Ibovespa', () => {
    expect(formatIndexPoints(176799.84)).toBe('176.800 pts');
    expect(tickerLabel('^BVSP')).toBe('Ibovespa');
    expect(tickerLabel('PETR4')).toBe('PETR4');
  });
});
