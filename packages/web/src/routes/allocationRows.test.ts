import { describe, expect, it } from 'vitest';
import type { Position } from '@vetor-wallet/shared';
import { allocationCell, buildAllocationRows, sortByAllocation } from './allocationRows';

function pos(ticker: string, allocationPct: number | null): Position {
  return {
    ticker,
    quantity: 10,
    avgPrice: 20,
    invested: 200,
    currentPrice: allocationPct === null ? null : 25,
    currentValue: allocationPct === null ? null : 250,
    profitLoss: allocationPct === null ? null : 50,
    profitLossPct: allocationPct === null ? null : 25,
    allocationPct,
  };
}

describe('buildAllocationRows', () => {
  it('returns an empty list for an empty portfolio', () => {
    expect(buildAllocationRows([])).toEqual([]);
  });

  it('sorts positions by allocationPct descending', () => {
    const rows = buildAllocationRows([pos('AAA3', 20), pos('BBB3', 70), pos('CCC3', 10)]);
    expect(rows.map((r) => r.ticker)).toEqual(['BBB3', 'AAA3', 'CCC3']);
  });

  it('formats pct with 1 decimal in pt-BR', () => {
    const [row] = buildAllocationRows([pos('AAA3', 42.34)]);
    expect(row.pctLabel).toBe('42,3%');
    expect(row.pctClamped).toBeCloseTo(42.34);
  });

  it('places positions with null allocationPct last, never producing NaN', () => {
    const rows = buildAllocationRows([pos('AAA3', null), pos('BBB3', 60), pos('CCC3', null)]);
    expect(rows.map((r) => r.ticker)).toEqual(['BBB3', 'AAA3', 'CCC3']);
    expect(rows[1].pct).toBeNull();
    expect(rows[1].pctLabel).toBe('—');
    expect(rows[1].pctClamped).toBe(0);
    expect(rows[2].pctLabel).toBe('—');
    expect(rows[2].pctClamped).toBe(0);
    expect(Number.isNaN(rows[1].pctClamped)).toBe(false);
  });

  it('preserves relative order among positions with all-null allocationPct', () => {
    const rows = buildAllocationRows([pos('AAA3', null), pos('BBB3', null)]);
    expect(rows.map((r) => r.ticker)).toEqual(['AAA3', 'BBB3']);
  });

  it('clamps an out-of-range pct for the bar width without altering the label', () => {
    const [row] = buildAllocationRows([pos('AAA3', 100)]);
    expect(row.pctClamped).toBe(100);
    expect(row.pctLabel).toBe('100,0%');
  });

  // T-059: caso de valor DE FATO acima de 100 (o teste acima só cobre o
  // limite exato) — o percentual bruto/label preservam o valor real, só a
  // largura da barra (`pctClamped`) é limitada a 100.
  it('clamps pct above 100 for the bar width, keeping the real value in pct/pctLabel', () => {
    const [row] = buildAllocationRows([pos('AAA3', 142.7)]);
    expect(row.pct).toBe(142.7);
    expect(row.pctClamped).toBe(100);
    expect(row.pctLabel).toBe('142,7%');
  });

  it('does not mutate the input array', () => {
    const positions = [pos('AAA3', 10), pos('BBB3', 90)];
    buildAllocationRows(positions);
    expect(positions.map((p) => p.ticker)).toEqual(['AAA3', 'BBB3']);
  });
});

describe('sortByAllocation / allocationCell (coluna da tabela de Posições)', () => {
  it('ordena posições por alocação, nulos por último, sem mutar a entrada', () => {
    const input = [pos('AAA3', null), pos('BBB3', 10), pos('CCC3', 60)];
    expect(sortByAllocation(input).map((p) => p.ticker)).toEqual(['CCC3', 'BBB3', 'AAA3']);
    expect(input.map((p) => p.ticker)).toEqual(['AAA3', 'BBB3', 'CCC3']);
  });

  it('allocationCell limita a barra a [0, 100] e usa "—" sem cotação', () => {
    expect(allocationCell(pos('A', 130)).pctClamped).toBe(100);
    expect(allocationCell(pos('A', -3)).pctClamped).toBe(0);
    expect(allocationCell(pos('A', null))).toMatchObject({
      pct: null,
      pctClamped: 0,
      pctLabel: '—',
    });
    expect(allocationCell(pos('A', 5)).pctLabel).toBe('5,0%');
  });
});
